/*
 * This file is released under the MIT license.
 * Copyright (c) 2016, 2017, Mike Lischke
 *
 * See LICENSE file for more info.
 */

"use strict";

import { Parser, ParserRuleContext, RuleContext, Token, TokenStream, Vocabulary } from "antlr4ts";
import { ATN, ATNState, ATNStateType, PredicateTransition, RuleStartState, RuleTransition, Transition, TransitionType } from "antlr4ts/atn";
import { IntervalSet } from "antlr4ts/misc";

export type TokenList = number[];
export type RuleList = number[];

// All the candidates which have been found. Tokens and rules are separated (both use a numeric value).
// Token entries include a list of tokens that directly follow them (see also the "following" member in the FollowSetWithPath class).
export class CandidatesCollection {
    public tokens: Map<number, TokenList> = new Map();
    public rules: Map<number, RuleList> = new Map();
}

// A record for a follow set along with the path at which this set was found.
// If there is only a single symbol in the interval set then we also collect and store tokens which follow
// this symbol directly in its rule (i.e. there is no intermediate rule transition). Only single label transitions
// are considered. This is useful if you have a chain of tokens which can be suggested as a whole, because there is
// a fixed sequence in the grammar.
// tslint:disable-next-line:max-classes-per-file
class FollowSetWithPath {
    public intervals: IntervalSet;
    public path: RuleList = [];
    public following: TokenList = [];
}

// A list of follow sets (for a given state number) + all of them combined for quick hit tests.
// This data is static in nature (because the used ATN states are part of a static struct: the ATN).
// Hence it can be shared between all C3 instances, however it depends on the actual parser class (type).
// tslint:disable-next-line:max-classes-per-file
class FollowSetsHolder {
    public sets: FollowSetWithPath[];
    public combined: IntervalSet;
}

type FollowSetsPerState = Map<number, FollowSetsHolder>;

// Token stream position info after a rule was processed.
type RuleEndStatus = Set<number>;

// tslint:disable-next-line:max-classes-per-file
class PipelineEntry {
    state: ATNState;
    tokenIndex: number;
}

// The main class for doing the collection process.
// tslint:disable-next-line:max-classes-per-file
export class CodeCompletionCore {
    // Debugging options. Print human readable ATN state and other info.
    public showResult = false;                 // Not dependent on showDebugOutput. Prints the collected rules + tokens to terminal.
    public showDebugOutput = false;            // Enables printing ATN state info to terminal.
    public debugOutputWithTransitions = false; // Only relevant when showDebugOutput is true. Enables transition printing for a state.
    public showRuleStack = false;              // Also depends on showDebugOutput. Enables call stack printing for each rule recursion.

    // Tailoring of the result.
    public ignoredTokens: Set<number>;        // Tokens which should not appear in the candidates set.
    public preferredRules: Set<number>;       // Rules which replace any candidate token they contain.
    // This allows to return descriptive rules (e.g. className, instead of ID/identifier).

    private parser: Parser;
    private atn: ATN;
    private vocabulary: Vocabulary;
    private ruleNames: string[];
    private tokens: TokenList;

    private tokenStartIndex: number = 0;

    private statesProcessed: number = 0;

    // A mapping of rule index + token stream position to end token positions.
    // A rule which has been visited before with the same input position will always produce the same output positions.
    private shortcutMap: Map<number, Map<number, RuleEndStatus>> = new Map();
    private candidates: CandidatesCollection = new CandidatesCollection(); // The collected candidates (rules and tokens).
    private candidateRulesToIgnore: number[] = [];

    // tslint:disable-next-line:member-ordering
    private static followSetsByATN: Map<string, FollowSetsPerState> = new Map();

    constructor(parser: Parser) {
        this.parser = parser;
        this.atn = parser.atn;
        this.vocabulary = parser.vocabulary;
        this.ruleNames = parser.ruleNames;
        this.ignoredTokens = new Set();
        this.preferredRules = new Set();
    }

    /**
     * This is the main entry point. The caret token index specifies the token stream index for the token which currently
     * covers the caret (or any other position you want to get code completion candidates for).
     * Optionally you can pass in a parser rule context which limits the ATN walk to only that or called rules. This can significantly
     * speed up the retrieval process but might miss some candidates (if they are outside of the given context).
     */
    public collectCandidates(caretTokenIndex: number, context?: ParserRuleContext): CandidatesCollection {
        this.shortcutMap.clear();
        this.candidates.rules.clear();
        this.candidates.tokens.clear();
        this.candidateRulesToIgnore = [];

        this.statesProcessed = 0;

        this.tokenStartIndex = context ? context.start.tokenIndex : 0;
        const tokenStream: TokenStream = this.parser.inputStream;

        const currentIndex = tokenStream.index;
        tokenStream.seek(this.tokenStartIndex);
        this.tokens = [];
        let offset = 1;
        while (true) {
            const token = tokenStream.LT(offset++);
            this.tokens.push(token.type);
            if (token.tokenIndex >= caretTokenIndex || token.type === Token.EOF) {
                break;
            }
        }
        tokenStream.seek(currentIndex);

        const callStack: number[] = [];
        const startRule = context ? context.ruleIndex : 0;
        this.processRule(this.atn.ruleToStartState[startRule], 0, callStack, "");

        if (this.showResult) {
            // console.log("States processed: " + this.statesProcessed);
            console.log("\n\nCollected rules:\n");
            for (const rule of this.candidates.rules) {
                let path = "";
                for (const token of rule[1]) {
                    path += this.ruleNames[token] + " ";
                }
                console.log(this.ruleNames[rule[0]] + ", path: ", path);
            }

            const sortedTokens: Set<string> = new Set();
            for (const token of this.candidates.tokens) {
                let value: string = this.vocabulary.getDisplayName(token[0]);
                for (const following of token[1]) {
                    value += " " + this.vocabulary.getDisplayName(following);
                }
                sortedTokens.add(value);
            }

            console.log("\n\nCollected tokens:\n");
            for (const symbol of sortedTokens) {
                console.log(symbol);
            }
            console.log("\n\n");
        }

        this.candidateRulesToIgnore.forEach((ruleIndex) => {
            // console.log("removing rules to ignore...", ruleIndex, this.ruleNames[ruleIndex]);
            this.candidates.rules.delete(ruleIndex);
        });

        return this.candidates;
    }

    /**
     * Checks if the predicate associated with the given transition evaluates to true.
     */
    private checkPredicate(transition: PredicateTransition): boolean {
        return transition.predicate.eval(this.parser, ParserRuleContext.emptyContext());
    }

    /**
     * Walks the rule chain upwards to see if that matches any of the preferred rules.
     * If found, that rule is added to the collection candidates and true is returned.
     */
    private translateToRuleIndex(ruleStack: RuleList): boolean {
        if (this.preferredRules.size === 0) {
            return false;
        }
        // console.log(ruleStack);
        // console.log(`translateToRuleIndex ${ruleStack[ruleStack.length - 1]}`);

        // Loop over the rule stack from highest to lowest rule level. This way we properly handle the higher rule
        // if it contains a lower one that is also a preferred rule.
        for (let i = 0; i < ruleStack.length; ++i) {
            if (this.preferredRules.has(ruleStack[i])) {
                // Add the rule to our candidates list along with the current rule path,
                // but only if there isn't already an entry like that.
                const path = ruleStack.slice(0, i);
                let addNew = true;
                for (const rule of this.candidates.rules) {
                    if (rule[0] !== ruleStack[i] || rule[1].length !== path.length) {
                        continue;
                    }
                    // Found an entry for this rule. Same path? If so don't add a new (duplicate) entry.
                    if (path.every((v, j) => v === rule[1][j])) {
                        addNew = false;
                        break;
                    }
                }

                if (addNew) {
                    const ruleNumber = ruleStack[i];

                    this.candidates.rules.set(ruleNumber, path);
                    if (this.showDebugOutput) {
                        console.log("=====> collected candidates.rules: ", this.ruleNames[ruleNumber]);
                    }
                }
                return true;
            }
        }

        return false;
    }

    /**
     * This method follows the given transition and collects all symbols within the same rule that directly follow it
     * without intermediate transitions to other rules and only if there is a single symbol for a transition.
     */
    private getFollowingTokens(transition: Transition): number[] {
        const result: number[] = [];

        const seen: ATNState[] = [];
        const pipeline: ATNState[] = [transition.target];

        while (pipeline.length > 0) {
            const state = pipeline.pop();

            for (const t of state!.getTransitions()) {
                if (t.serializationType === TransitionType.ATOM) {
                    if (!t.isEpsilon) {
                        const list = t.label!.toList();
                        if (list.length === 1 && !this.ignoredTokens.has(list[0])) {
                            result.push(list[0]);
                            pipeline.push(t.target);
                        }
                    } else {
                        pipeline.push(t.target);
                    }
                }
            }
        }

        return result;
    }

    /**
     * Entry point for the recursive follow set collection function.
     */
    private determineFollowSets(start: ATNState, stop: ATNState): FollowSetWithPath[] {
        const result: FollowSetWithPath[] = [];
        const seen: Set<ATNState> = new Set();
        const ruleStack: number[] = [];
        this.collectFollowSets(start, stop, result, seen, ruleStack);

        return result;
    }

    /**
     * Collects possible tokens which could be matched following the given ATN state. This is essentially the same
     * algorithm as used in the LL1Analyzer class, but here we consider predicates also and use no parser rule context.
     */
    private collectFollowSets(s: ATNState, stopState: ATNState, followSets: FollowSetWithPath[], seen: Set<ATNState>, ruleStack: number[]) {

        if (seen.has(s)) {
            return;
        }

        seen.add(s);

        if (s === stopState || s.stateType === ATNStateType.RULE_STOP) {
            const set = new FollowSetWithPath();
            set.intervals = IntervalSet.of(Token.EPSILON);
            set.path = ruleStack.slice();
            followSets.push(set);
            return;
        }

        for (const transition of s.getTransitions()) {
            if (transition.serializationType === TransitionType.RULE) {
                const ruleTransition: RuleTransition = transition as RuleTransition;
                if (ruleStack.indexOf(ruleTransition.target.ruleIndex) !== -1) {
                    continue;
                }

                ruleStack.push(ruleTransition.target.ruleIndex);
                this.collectFollowSets(transition.target, stopState, followSets, seen, ruleStack);
                ruleStack.pop();

            } else if (transition.serializationType === TransitionType.PREDICATE) {
                if (this.checkPredicate(transition as PredicateTransition)) {
                    this.collectFollowSets(transition.target, stopState, followSets, seen, ruleStack);
                }
            } else if (transition.isEpsilon) {
                this.collectFollowSets(transition.target, stopState, followSets, seen, ruleStack);
            } else if (transition.serializationType === TransitionType.WILDCARD) {
                const set = new FollowSetWithPath();
                set.intervals = IntervalSet.of(Token.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType);
                set.path = ruleStack.slice();
                followSets.push(set);
            } else {
                let label = transition.label;
                if (label && label.size > 0) {
                    if (transition.serializationType === TransitionType.NOT_SET) {
                        label = label.complement(IntervalSet.of(Token.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType));
                    }
                    const set = new FollowSetWithPath();
                    set.intervals = label;
                    set.path = ruleStack.slice();
                    set.following = this.getFollowingTokens(transition);
                    followSets.push(set);
                }
            }
        }
    }

    /**
     * Walks the ATN for a single rule only. It returns the token stream position for each path that could be matched in this rule.
     * The result can be empty in case we hit only non-epsilon transitions that didn't match the current input or if we
     * hit the caret position.
     */
    private processRule(startState: ATNState, tokenIndex: number, callStack: number[], indentation: string): RuleEndStatus {

        // Start with rule specific handling before going into the ATN walk.

        // Check first if we've taken this path with the same input before.

        // const isAtCaret = tokenIndex >= this.tokens.length - 1;
        const rn = this.ruleNames[startState.ruleIndex];

        let positionMap = this.shortcutMap.get(startState.ruleIndex);
        if (!positionMap) {
            positionMap = new Map();
            this.shortcutMap.set(startState.ruleIndex, positionMap);
        } else {
            if (positionMap.has(tokenIndex)) {
                if (this.showDebugOutput) {
                    // console.log("=====> shortcut");
                }
                return positionMap.get(tokenIndex)!;
            }
        }

        const result: RuleEndStatus = new Set<number>();

        // For rule start states we determine and cache the follow set, which gives us 3 advantages:
        // 1) We can quickly check if a symbol would be matched when we follow that rule. We can so check in advance
        //    and can save us all the intermediate steps if there is no match.
        // 2) We'll have all symbols that are collectable already together when we are at the caret when entering a rule.
        // 3) We get this lookup for free with any 2nd or further visit of the same rule, which often happens
        //    in non trivial grammars, especially with (recursive) expressions and of course when invoking code completion
        //    multiple times.
        let setsPerState = CodeCompletionCore.followSetsByATN.get(this.parser.constructor.name);
        if (!setsPerState) {
            setsPerState = new Map();
            CodeCompletionCore.followSetsByATN.set(this.parser.constructor.name, setsPerState);
        }

        let followSets = setsPerState.get(startState.stateNumber);
        if (!followSets) {
            followSets = new FollowSetsHolder();
            setsPerState.set(startState.stateNumber, followSets);
            const stop = this.atn.ruleToStopState[startState.ruleIndex];
            followSets.sets = this.determineFollowSets(startState, stop);

            // Sets are split by path to allow translating them to preferred rules. But for quick hit tests
            // it is also useful to have a set with all symbols combined.
            const combined = new IntervalSet();
            for (const set of followSets.sets) {
                combined.addAll(set.intervals);
            }
            followSets.combined = combined;
        }

        callStack.push(startState.ruleIndex);

        if (tokenIndex >= this.tokens.length - 1) { // At caret?
            if (this.preferredRules.has(startState.ruleIndex)) {
                // No need to go deeper when collecting entries and we reach a rule that we want to collect anyway.
                // const f = startState.getTransitions().filter((t) =>
                //  t.target.ruleIndex === startState.ruleIndex && t.target.stateType === ATNStateType.RULE_STOP);
                // console.log(`at caret adding ${startState.ruleIndex}`);
                // console.log(`has RULE STOP=${f.length}`);
                this.translateToRuleIndex(callStack);
            } else {
                // Convert all follow sets to either single symbols or their associated preferred rule and add
                // the result to our candidates list.
                for (const set of followSets.sets) {
                    const fullPath = callStack.slice();
                    fullPath.push(...set.path);
                    if (!this.translateToRuleIndex(fullPath)) {
                        for (const symbol of set.intervals.toList()) {
                            if (!this.ignoredTokens.has(symbol)) {
                                if (this.showDebugOutput) {
                                    console.log("=====> collected: ", this.vocabulary.getDisplayName(symbol));
                                }
                                if (!this.candidates.tokens.has(symbol)) {
                                    this.candidates.tokens.set(symbol, set.following);
                                } else {
                                    // More than one following list for the same symbol.
                                    if (this.candidates.tokens.get(symbol) !== set.following) {
                                        this.candidates.tokens.set(symbol, []);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            callStack.pop();
            return result;

        } else {
            // Process the rule if we either could pass it without consuming anything (epsilon transition)
            // or if the current input symbol will be matched somewhere after this entry point.
            // Otherwise stop here.
            const currentSymbol = this.tokens[tokenIndex];
            if (!followSets.combined.contains(Token.EPSILON) && !followSets.combined.contains(currentSymbol)) {
                callStack.pop();
                return result;
            }
        }

        // The current state execution pipeline contains all yet-to-be-processed ATN states in this rule.
        // For each such state we store the token index + a list of rules that lead to it.
        const statePipeline: PipelineEntry[] = [];
        let currentEntry;

        // Bootstrap the pipeline.
        statePipeline.push({ state: startState, tokenIndex });

        while (statePipeline.length > 0) {
            // console.log(`statePipeline.len = ${statePipeline.length}`);
            currentEntry = statePipeline.pop()!;
            // console.log(`statePipeline.rule = ${currentEntry.state.ruleIndex}`);
            ++this.statesProcessed;

            const currentSymbol = this.tokens[currentEntry.tokenIndex];

            const atCaret = currentEntry.tokenIndex >= this.tokens.length - 1;
            if (this.showDebugOutput) {
                // tslint:disable-next-line:max-line-length
                this.printDescription(indentation, currentEntry.state, this.generateBaseDescription(currentEntry.state), currentEntry.tokenIndex);
                if (this.showRuleStack) {
                    this.printRuleState(callStack);
                }
            }

            switch (currentEntry.state.stateType) {
                case ATNStateType.RULE_START: // Happens only for the first state in this rule, not subrules.
                    indentation += "  ";
                    break;

                case ATNStateType.RULE_STOP: {
                    // Record the token index we are at, to report it to the caller.
                    result.add(currentEntry.tokenIndex);
                    continue;
                }

                default:
                    break;
            }

            const transitions = currentEntry.state.getTransitions();
            for (const transition of transitions) {
                switch (transition.serializationType) {
                    case TransitionType.RULE: {
                        const endStatus = this.processRule(transition.target, currentEntry.tokenIndex, callStack, indentation);
                        for (const position of endStatus) {
                            statePipeline.push({ state: (transition as RuleTransition).followState, tokenIndex: position });
                        }
                        break;
                    }

                    case TransitionType.PREDICATE: {
                        if (this.checkPredicate(transition as PredicateTransition)) {
                            statePipeline.push({ state: transition.target, tokenIndex: currentEntry.tokenIndex });
                        }
                        break;
                    }

                    case TransitionType.WILDCARD: {
                        if (atCaret) {
                            if (!this.translateToRuleIndex(callStack)) {
                                for (const token of IntervalSet.of(Token.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType).toList()) {
                                    if (!this.ignoredTokens.has(token)) {
                                        this.candidates.tokens.set(token, []);
                                    }
                                }
                            }
                        } else {
                            statePipeline.push({ state: transition.target, tokenIndex: currentEntry.tokenIndex + 1 });
                        }
                        break;
                    }

                    default: {
                        if (transition.isEpsilon) {
                            if (atCaret) {
                                this.translateToRuleIndex(callStack);
                            }
                            if (atCaret && transition.target.stateType === ATNStateType.RULE_STOP) {
                                const stoppedRule = transition.target.ruleIndex;
                                // console.log("-----------------");
                                // console.log(`Should ignore ${stoppedRule} has direct link to ruleStop`);
                                // console.log("-----------------");
                                this.candidateRulesToIgnore.push(stoppedRule);
                            }
                            // Jump over simple states with a single outgoing epsilon transition.
                            statePipeline.push({ state: transition.target, tokenIndex: currentEntry.tokenIndex });
                            continue;
                        }

                        let set = transition.label;
                        if (set && set.size > 0) {
                            if (transition.serializationType === TransitionType.NOT_SET) {
                                set = set.complement(IntervalSet.of(Token.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType));
                            }
                            if (atCaret) {
                                if (!this.translateToRuleIndex(callStack)) {
                                    const list = set.toList();
                                    const addFollowing = list.length === 1;
                                    for (const symbol of list) {
                                        if (!this.ignoredTokens.has(symbol)) {
                                            if (this.showDebugOutput) {
                                                console.log("=====> collected: ", this.vocabulary.getDisplayName(symbol));
                                            }

                                            if (addFollowing) {
                                                this.candidates.tokens.set(symbol, this.getFollowingTokens(transition));
                                            } else {
                                                this.candidates.tokens.set(symbol, []);
                                            }
                                        }
                                    }
                                }
                            } else {
                                if (set.contains(currentSymbol)) {
                                    if (this.showDebugOutput) {
                                        console.log("=====> consumed: ", this.vocabulary.getDisplayName(currentSymbol));
                                    }
                                    statePipeline.push({ state: transition.target, tokenIndex: currentEntry.tokenIndex + 1 });
                                }
                            }
                        }
                    }
                }
            }
        }

        callStack.pop();

        // Cache the result, for later lookup to avoid duplicate walks.
        positionMap.set(tokenIndex, result);

        return result;
    }

    // tslint:disable-next-line:member-ordering
    private atnStateTypeMap: string[] = [
        "invalid",
        "basic",
        "rule start",
        "block start",
        "plus block start",
        "star block start",
        "token start",
        "rule stop",
        "block end",
        "star loop back",
        "star loop entry",
        "plus loop back",
        "loop end",
    ];

    private generateBaseDescription(state: ATNState): string {
        const stateValue = state.stateNumber === ATNState.INVALID_STATE_NUMBER ? "Invalid" : state.stateNumber;
        return "[" + stateValue + " " + this.atnStateTypeMap[state.stateType] + "] in " + this.ruleNames[state.ruleIndex];
    }

    private printDescription(currentIndent: string, state: ATNState, baseDescription: string, tokenIndex: number) {

        let output = currentIndent;

        let transitionDescription = "";
        if (this.debugOutputWithTransitions) {
            for (const transition of state.getTransitions()) {
                let labels = "";
                const symbols: number[] = transition.label ? transition.label.toList() : [];
                if (symbols.length > 2) {
                    // Only print start and end symbols to avoid large lists in debug output.
                    // tslint:disable-next-line:max-line-length
                    labels = this.vocabulary.getDisplayName(symbols[0]) + " .. " + this.vocabulary.getDisplayName(symbols[symbols.length - 1]);
                } else {
                    for (const symbol of symbols) {
                        if (labels.length > 0) {
                            labels += ", ";
                        }
                        labels += this.vocabulary.getDisplayName(symbol);
                    }
                }
                if (labels.length === 0) {
                    labels = "ε";
                }
                transitionDescription += "\n" + currentIndent + "\t(" + labels + ") " + "[" + transition.target.stateNumber + " " +
                    this.atnStateTypeMap[transition.target.stateType] + "] in " + this.ruleNames[transition.target.ruleIndex];
            }
        }

        if (tokenIndex >= this.tokens.length - 1) {
            output += "<<" + this.tokenStartIndex + tokenIndex + ">> ";
        } else {
            output += "<" + this.tokenStartIndex + tokenIndex + "> ";
        }
        // console.log(output + "Current state: " + baseDescription + transitionDescription);
    }

    private printRuleState(stack: number[]) {
        if (stack.length === 0) {
            console.log("<empty stack>");
            return;
        }

        for (const rule of stack) {
            console.log(this.ruleNames[rule]);
        }
    }

}

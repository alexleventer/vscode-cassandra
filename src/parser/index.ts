import {
    ANTLRErrorListener, ANTLRInputStream, CommonTokenStream,
    ConsoleErrorListener, RecognitionException, Recognizer, Token,
} from "antlr4ts";
import { CqlLexer } from "../antlr/CqlLexer";
import { CqlParser, RootContext } from "../antlr/CqlParser";

export interface CqlParserError {
    name: string;
    token: TokenData;
    line: number;
    linePos: number;
}
// export interface ParserResult {
//     root: RootContext;
//     errors: CqlParserError[];
// }
export interface TokenData {
    text: string;
    type: number;
    line: number;
    charPositionInLine: number;
    channel: number;
    tokenIndex: number;
    startIndex: number;
    stopIndex: number;
}

export class InputParser {

    public collectErrors(input: string): CqlParserError[] {
        const inputStream = new ANTLRInputStream(input);
        const cqlLexer = new CqlLexer(inputStream);
        const tokenStream = new CommonTokenStream(cqlLexer);
        const cqlParser = new CqlParser(tokenStream);

        // cqlLexer.addErrorListener(errorLexer);
        // cqlParser.addErrorListener(errorParser);

        cqlParser.removeErrorListener(ConsoleErrorListener.INSTANCE);
        const errors: CqlParserError[] = [];

        const errorHandler: ANTLRErrorListener<Token> = {
            syntaxError: (
                recognizer: Recognizer<any, any>,
                offendingSymbol: any | undefined,
                line: number, charPositionInLine: number, msg: string, e?: RecognitionException) => {
                const error: CqlParserError = {
                    name: msg,
                    token: this.extractTokentData(offendingSymbol),
                    line,
                    linePos: charPositionInLine,

                };
                errors.push(error);
            },
        };
        cqlParser.addErrorListener(errorHandler);

        // const listener = new AntlrListener(tokenStream, cqlParser.ruleNames);
        // cqlParser.addParseListener(listener);
        const root = cqlParser.root();

        // const out = listener.rewriter.getText();
        return errors;
    }
    private extractTokentData(token: Token): TokenData {
        if (token == null) {
            return null;
        }
        const o: TokenData = {
            text: token.text,
            type: token.type,
            line: token.line,
            charPositionInLine: token.charPositionInLine,
            channel: token.channel,
            tokenIndex: token.tokenIndex,
            startIndex: token.startIndex,
            stopIndex: token.stopIndex,

        };

        return o;
    }
}

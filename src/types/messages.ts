import { WorkbenchCqlStatement } from "./editor";
import { CassandraCluster } from "./index";

export interface ProcMessageList {
    w2e_getClustersRequest: boolean;
    w2e_onReady: boolean;
    w2e_parseInput: string;
    w2e_persistEditors: WorkbenchCqlStatement[];
    e2w_goState: WebviewStateParams;
    e2w_parseOutput: string;
    e2w_editorCreate: EditorCreateParams;
    e2w_getClustersResponse: CassandraCluster[];
}
export type ProcMessageType = keyof ProcMessageList;
export interface ProcMessage {
    name: ProcMessageType;
    data: any;
}
export interface ProcMessageStrict<T extends keyof ProcMessageList> {
    name: T;
    data: ProcMessageList[T];
}
export interface WebviewStateParams {
    name: string;
    params: { [key: string]: any };
}
export interface EditorCreateParams {
    statement: WorkbenchCqlStatement;
    execute: boolean;
}

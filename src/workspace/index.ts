import * as vscode from "vscode";
import { WorkspaceSettings } from "../types/workspace";
export class Workspace {
    private ws = vscode.workspace.getConfiguration();
    public getRootPath(): string {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    public isMultiRootWorkspace(): boolean {
        return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1;
    }
    public read<T extends keyof WorkspaceSettings>(key: T): WorkspaceSettings[T] {
        const ws = vscode.workspace.getConfiguration();
        const v: WorkspaceSettings[T] = ws.get("cassandraWorkbench." + key) as WorkspaceSettings[T];
        return v;
    }
    public write<T extends keyof WorkspaceSettings>(key: T, value: WorkspaceSettings[T]): void {
        const ws = vscode.workspace.getConfiguration();
        ws.update("cassandraWorkbench." + key, value, false);
    }
    public getConfigurationRoot() {
        const workspaceIndex  = this.read("useWorkspace");
        const path = vscode.workspace.workspaceFolders[workspaceIndex] != null
                     ? vscode.workspace.workspaceFolders[workspaceIndex].uri.fsPath
                     : vscode.workspace.workspaceFolders[0].uri.fsPath;

        return path;
    }
}

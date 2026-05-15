import * as vscode from "vscode";
import type { IndexedWorkspace } from "../core/files/FileIndex";

export class VsCodeWorkspace {
  getWorkspaces(): IndexedWorkspace[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder, index) => ({
      id: String(index),
      name: folder.name,
      rootPath: folder.uri.fsPath,
    }));
  }

  getPrimaryWorkspaceRoot(): string | undefined {
    return this.getWorkspaces()[0]?.rootPath;
  }
}


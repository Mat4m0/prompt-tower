import * as vscode from "vscode";
import type { ServiceContainer } from "./serviceContainer";

export class WorkspaceSession {
  constructor(
    private context: vscode.ExtensionContext,
    private services: ServiceContainer
  ) {}

  start(): void {
    const refresh = async () => {
      try {
        this.services.logger.info("[watcher] file event refresh requested");
        this.services.fileIndex.markDirty();
        await this.services.fileIndex.ensureFresh();
        this.services.fileSelection.reconcile(this.services.fileIndex.getSnapshot());
      } catch (error) {
        this.services.logger.error("[watcher] file event refresh failed", error);
      }
    };

    for (const workspace of this.services.workspace.getWorkspaces()) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspace.rootPath, "**/*")
      );
      watcher.onDidCreate(refresh);
      watcher.onDidChange(refresh);
      watcher.onDidDelete(refresh);
      this.context.subscriptions.push(watcher);
    }
  }
}

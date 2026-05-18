import * as vscode from 'vscode'
import type { ExtensionServices } from './extensionServices'
import {
  createDebouncedRefreshScheduler,
  shouldRefreshForFileEvent,
} from './workspaceRefreshEvents'

export class WorkspaceSession {
  private refreshScheduler = createDebouncedRefreshScheduler(() => {
    void this.refresh()
  }, 250)

  constructor(
    private context: vscode.ExtensionContext,
    private services: ExtensionServices,
  ) {}

  start(): void {
    for (const workspace of this.services.getWorkspaces()) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspace.rootPath, '**/*'),
      )
      watcher.onDidCreate((uri) => this.scheduleRefresh(workspace.rootPath, uri.fsPath))
      watcher.onDidChange((uri) => this.scheduleRefresh(workspace.rootPath, uri.fsPath))
      watcher.onDidDelete((uri) => this.scheduleRefresh(workspace.rootPath, uri.fsPath))
      this.context.subscriptions.push(watcher)
    }
  }

  dispose(): void {
    this.refreshScheduler.dispose()
  }

  private scheduleRefresh(workspaceRoot: string, eventPath: string): void {
    if (!shouldRefreshForFileEvent(workspaceRoot, eventPath)) {
      this.services.logger.info(`[watcher] ignored file event: ${eventPath}`)
      return
    }
    this.services.fileIndex.markDirty()
    this.refreshScheduler.requestRefresh()
  }

  private async refresh(): Promise<void> {
    try {
      this.services.logger.info('[watcher] debounced refresh requested')
      await this.services.fileIndex.ensureFresh()
      this.services.fileSelection.reconcile(this.services.fileIndex.getSnapshot())
    } catch (error) {
      this.services.logger.error('[watcher] file event refresh failed', error)
    }
  }
}

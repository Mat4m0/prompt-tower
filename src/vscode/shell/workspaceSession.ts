import * as vscode from 'vscode'
import type { ExtensionServices } from './extensionServices'

export class WorkspaceSession {
  private refreshTimer: NodeJS.Timeout | undefined

  constructor(
    private context: vscode.ExtensionContext,
    private services: ExtensionServices,
  ) {}

  start(): void {
    for (const workspace of this.services.getWorkspaces()) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspace.rootPath, '**/*'),
      )
      watcher.onDidCreate(() => this.scheduleRefresh())
      watcher.onDidChange(() => this.scheduleRefresh())
      watcher.onDidDelete(() => this.scheduleRefresh())
      this.context.subscriptions.push(watcher)
    }
  }

  private scheduleRefresh(): void {
    this.services.fileIndex.markDirty()
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      void this.refresh()
    }, 250)
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

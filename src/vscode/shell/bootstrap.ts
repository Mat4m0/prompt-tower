import * as vscode from 'vscode'
import { getWebviewHtml } from '../webview/webviewHost'
import { FileTreeProvider } from '../views/FileTreeProvider'
import { GitCommitsProvider } from '../views/GitCommitsProvider'
import { SelectionFiltersProvider } from '../views/SelectionFiltersProvider'
import { registerCommands } from './commandRegistry'
import { createServiceContainer } from './serviceContainer'
import { MessageRouter } from './messageRouter'
import { isWebviewMessage } from '../../shared/messages'
import { WorkspaceSession } from './workspaceSession'

const VIEW_TYPE = 'lupinumContext.context'

export async function bootstrapLupinumContext(
  context: vscode.ExtensionContext,
): Promise<vscode.Disposable> {
  const services = createServiceContainer(context)
  context.subscriptions.push(services.logger)
  services.logger.info('[bootstrap] activating Lupinum Context')
  await services.promptPresets.migrateOldPrefixHistory()
  services.fileSelection.restoreIntent(
    services.fileIndex.getSnapshot(),
    services.workspaceState.getSelectionIntent(),
  )

  const disposables: vscode.Disposable[] = []
  let panel: vscode.WebviewPanel | undefined
  let router: MessageRouter | undefined

  const fileTreeProvider = new FileTreeProvider(services.fileIndex, services.fileSelection)
  const selectionFiltersProvider = new SelectionFiltersProvider(services.fileSelection)
  const gitCommitsProvider = new GitCommitsProvider(services.gitSelection)

  const fileTree = vscode.window.createTreeView('lupinumContext.files', {
    treeDataProvider: fileTreeProvider,
    canSelectMany: true,
    showCollapseAll: true,
    manageCheckboxStateManually: true,
  })
  const filtersTree = vscode.window.createTreeView('lupinumContext.selectionFilters', {
    treeDataProvider: selectionFiltersProvider,
    manageCheckboxStateManually: true,
  })
  const gitTree = vscode.window.createTreeView('lupinumContext.gitCommits', {
    treeDataProvider: gitCommitsProvider,
    manageCheckboxStateManually: true,
  })
  disposables.push(fileTree, filtersTree, gitTree)

  services.fileSelection.onDidChange(() => {
    void services.workspaceState.setSelectionIntent(services.fileSelection.getPersistedIntent())
    void router?.postState()
  })
  services.gitSelection.onDidChange(() => {
    void router?.postState()
  })

  const showPanel = async () => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside)
      return
    }
    panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      'Lupinum Context',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
      },
    )
    const currentRouter = new MessageRouter(
      services,
      panel,
      services.workspace.getPrimaryWorkspaceRoot() ?? process.cwd(),
    )
    router = currentRouter
    const webviewDir = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')
    const scriptUri = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(webviewDir, 'main.js'))
      .toString()
    const styleUri = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(webviewDir, 'main.css'))
      .toString()
    panel.webview.html = getWebviewHtml({
      scriptUri,
      styleUri,
      cspSource: panel.webview.cspSource,
      nonce: createNonce(),
      state: await currentRouter.createState(),
    })
    panel.webview.onDidReceiveMessage(async (message) => {
      if (!isWebviewMessage(message)) {
        return
      }
      try {
        await currentRouter.handle(message)
      } catch (error) {
        vscode.window.showErrorMessage(String(error))
      }
    })
    panel.onDidDispose(() => {
      panel = undefined
      router = undefined
    })
  }

  disposables.push(
    fileTree.onDidChangeVisibility((event) => {
      if (event.visible) {
        void showPanel()
      }
    }),
    fileTree.onDidChangeCheckboxState((event) => {
      for (const [node] of event.items) {
        services.fileSelection.toggleNode(services.fileIndex.getSnapshot(), node.id)
      }
    }),
    filtersTree.onDidChangeCheckboxState((event) => {
      for (const [node] of event.items) {
        services.fileSelection.setFileKindExcluded(
          services.fileIndex.getSnapshot(),
          node.group.id,
          !node.group.excluded,
        )
      }
    }),
    gitTree.onDidChangeCheckboxState((event) => {
      for (const [commit] of event.items) {
        services.gitSelection.toggleCommit(commit.id)
      }
    }),
  )

  registerCommands({
    context,
    services,
    fileTreeProvider,
    selectionFiltersProvider,
    gitCommitsProvider,
    showPanel,
  })

  const session = new WorkspaceSession(context, services)
  session.start()
  void refreshIndex(services, 'startup')
  void refreshCommits(services, 'startup')

  return new vscode.Disposable(() => {
    for (const disposable of disposables) {
      disposable.dispose()
    }
    panel?.dispose()
  })
}

async function refreshCommits(
  services: ReturnType<typeof createServiceContainer>,
  reason: string,
): Promise<void> {
  try {
    services.logger.info(`[git] refresh requested: ${reason}`)
    await services.gitService.refreshCommits()
    services.logger.info(`[git] refresh complete: ${reason}`)
  } catch (error) {
    services.logger.error(`[git] refresh failed: ${reason}`, error)
  }
}

async function refreshIndex(
  services: ReturnType<typeof createServiceContainer>,
  reason: string,
): Promise<void> {
  try {
    services.logger.info(`[refresh] requested: ${reason}`)
    services.fileIndex.markDirty()
    await services.fileIndex.ensureFresh()
    services.fileSelection.reconcile(services.fileIndex.getSnapshot())
    services.logger.info(`[refresh] complete: ${reason}`)
  } catch (error) {
    services.logger.error(`[refresh] failed: ${reason}`, error)
    vscode.window.showErrorMessage(`Lupinum Context refresh failed: ${String(error)}`)
  }
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let index = 0; index < 32; index++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

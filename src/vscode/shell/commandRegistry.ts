import * as vscode from 'vscode'
import type { ServiceContainer } from './serviceContainer'
import type { FileTreeProvider } from '../views/FileTreeProvider'
import type {
  SelectionFilterNode,
  SelectionFiltersProvider,
} from '../views/SelectionFiltersProvider'
import { isIndexedNode } from './messageRouter'

export function registerCommands(options: {
  context: vscode.ExtensionContext
  services: ServiceContainer
  fileTreeProvider: FileTreeProvider
  selectionFiltersProvider: SelectionFiltersProvider
  showPanel: () => void | Promise<void>
}): void {
  const { context, services, showPanel } = options

  context.subscriptions.push(
    vscode.commands.registerCommand('promptLupinum.open', showPanel),
    vscode.commands.registerCommand('promptLupinum.refresh', async () => {
      services.logger.info('[command] manual refresh requested')
      services.fileIndex.markDirty()
      await services.fileIndex.ensureFresh()
      services.fileSelection.reconcile(services.fileIndex.getSnapshot())
    }),
    vscode.commands.registerCommand('promptLupinum.showLogs', () => {
      services.logger.show()
    }),
    vscode.commands.registerCommand('promptLupinum.clearSelection', () => {
      services.fileSelection.clear(services.fileIndex.getSnapshot())
    }),
    vscode.commands.registerCommand('promptLupinum.includeAllSelectionFilters', () => {
      services.fileSelection.resetFilters(services.fileIndex.getSnapshot())
    }),
    vscode.commands.registerCommand('promptLupinum.excludeAllSelectionFilters', () => {
      services.fileSelection.excludeAllFilters(services.fileIndex.getSnapshot())
    }),
    vscode.commands.registerCommand('promptLupinum.toggleFileSelection', async (node: unknown) => {
      if (isIndexedNode(node)) {
        services.fileSelection.toggleNode(services.fileIndex.getSnapshot(), node.id)
      }
    }),
    vscode.commands.registerCommand(
      'promptLupinum.toggleSelectionFilter',
      (node: SelectionFilterNode) => {
        services.fileSelection.setFileKindExcluded(
          services.fileIndex.getSnapshot(),
          node.group.id,
          !node.group.excluded,
        )
      },
    ),
    vscode.commands.registerCommand('promptLupinum.addCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showWarningMessage('No active file.')
        return
      }
      await services.fileIndex.ensureFresh()
      const file = services.fileIndex.findFileByPath(editor.document.uri.fsPath)
      if (!file) {
        vscode.window.showWarningMessage('File is ignored or outside the workspace.')
        return
      }
      services.fileSelection.setNodeIncluded(services.fileIndex.getSnapshot(), file.id, true)
    }),
    vscode.commands.registerCommand('promptLupinum.copyContext', async () => {
      const output = await services.contextService.copyContext({
        prefix: services.promptPresets.getEffectivePrefix(),
        treeMode: services.workspaceState.getTreeMode(),
        outputMode: services.workspaceState.getOutputMode(),
      })
      vscode.window.showInformationMessage(`Copied ${output.fileCount} files to clipboard.`)
    }),
  )
}

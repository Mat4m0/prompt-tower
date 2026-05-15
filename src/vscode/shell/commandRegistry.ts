import * as vscode from 'vscode'
import type { ServiceContainer } from './serviceContainer'
import type { FileTreeProvider } from '../views/FileTreeProvider'
import type { GitCommitsProvider } from '../views/GitCommitsProvider'
import type {
  SelectionFilterNode,
  SelectionFiltersProvider,
} from '../views/SelectionFiltersProvider'
import { isIndexedNode } from './messageRouter'
import type { GitCommit } from '../../core/git/GitTypes'

export function registerCommands(options: {
  context: vscode.ExtensionContext
  services: ServiceContainer
  fileTreeProvider: FileTreeProvider
  selectionFiltersProvider: SelectionFiltersProvider
  gitCommitsProvider: GitCommitsProvider
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
    vscode.commands.registerCommand('promptLupinum.refreshGitCommits', async () => {
      await services.gitService.refreshCommits()
    }),
    vscode.commands.registerCommand('promptLupinum.clearGitCommits', () => {
      services.gitSelection.clear()
    }),
    vscode.commands.registerCommand('promptLupinum.selectLatestGitCommit', () => {
      services.gitSelection.selectLatest(1)
    }),
    vscode.commands.registerCommand('promptLupinum.selectLatestThreeGitCommits', () => {
      services.gitSelection.selectLatest(3)
    }),
    vscode.commands.registerCommand('promptLupinum.toggleGitCommit', (commit: GitCommit) => {
      if (commit?.id) {
        services.gitSelection.toggleCommit(commit.id)
      }
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
      vscode.window.showInformationMessage(formatCopyMessage(output.fileCount, output.commitCount))
    }),
  )
}

function formatCopyMessage(fileCount: number, commitCount: number): string {
  const files = `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`
  if (commitCount === 0) {
    return `Copied ${files} to clipboard.`
  }

  const commits = `${commitCount} ${commitCount === 1 ? 'commit diff' : 'commit diffs'}`
  return `Copied ${files} and ${commits} to clipboard.`
}

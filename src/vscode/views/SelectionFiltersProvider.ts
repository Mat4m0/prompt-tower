import * as vscode from 'vscode'
import type { FileSelection, SelectionFilterGroup } from '../../core/files/FileSelection'
import { formatTreeTokenCount } from '../../core/tokens/TokenEstimator'

export interface SelectionFilterNode {
  group: SelectionFilterGroup
}

export class SelectionFiltersProvider implements vscode.TreeDataProvider<SelectionFilterNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    SelectionFilterNode | undefined | void
  >()
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event

  constructor(private fileSelection: FileSelection) {
    this.fileSelection.onDidChange(() => this.refresh())
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire()
  }

  getTreeItem(element: SelectionFilterNode): vscode.TreeItem {
    const group = element.group
    const item = new vscode.TreeItem(formatFilterLabel(group), vscode.TreeItemCollapsibleState.None)
    item.checkboxState = group.excluded
      ? vscode.TreeItemCheckboxState.Unchecked
      : vscode.TreeItemCheckboxState.Checked
    item.description = group.excluded
      ? `excluded · ${formatTreeTokenCount(group.excludedTokenCount, 'estimated')}`
      : formatTreeTokenCount(group.selectedTokenCount, 'estimated')
    item.tooltip = group.excluded
      ? `${group.label} excluded from folder selections`
      : `${group.label} included`
    item.contextValue = 'selectionFilter'
    item.command = {
      command: 'promptLupinum.toggleSelectionFilter',
      title: 'Toggle Selection Filter',
      arguments: [element],
    }
    const resourceUri = getFilterResourceUri(group)
    if (resourceUri) {
      item.resourceUri = resourceUri
    } else {
      item.iconPath =
        group.id === 'pattern:test'
          ? new vscode.ThemeIcon('beaker')
          : new vscode.ThemeIcon('symbol-interface')
    }
    return item
  }

  getChildren(): SelectionFilterNode[] {
    return this.fileSelection.getSnapshot().filterGroups.map((group) => ({ group }))
  }
}

function formatFilterLabel(group: SelectionFilterGroup): string {
  return group.label
    .replace(/ files$/, '')
    .replace('Test files (*.test.*, *.spec.*)', 'Tests')
    .replace('Declaration files (*.d.ts)', 'Types')
}

function getFilterResourceUri(group: SelectionFilterGroup): vscode.Uri | undefined {
  const extension = group.id.startsWith('extension:')
    ? group.id.slice('extension:'.length)
    : undefined
  if (!extension || extension === '(no extension)') {
    return undefined
  }
  return vscode.Uri.file(`/__prompt_lupinum_filter__/filter${extension}`)
}

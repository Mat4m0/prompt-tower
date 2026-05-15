import * as vscode from "vscode";
import {
  MultiRootTreeProvider,
  type SelectionFilterGroup,
} from "./MultiRootTreeProvider";
import { formatTreeTokenCount } from "../utils/treeTokens";

export interface SelectionFilterNode {
  group: SelectionFilterGroup;
}

export class SelectionFiltersProvider
  implements vscode.TreeDataProvider<SelectionFilterNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    SelectionFilterNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private fileProvider: MultiRootTreeProvider) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SelectionFilterNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      formatFilterLabel(element.group),
      vscode.TreeItemCollapsibleState.None
    );
    item.checkboxState = element.group.excluded
      ? vscode.TreeItemCheckboxState.Unchecked
      : vscode.TreeItemCheckboxState.Checked;
    item.description = element.group.excluded
      ? `excluded · ${formatTreeTokenCount(element.group.excludedTokenCount, "estimated")}`
      : formatTreeTokenCount(element.group.selectedTokenCount, "estimated");
    item.tooltip = element.group.excluded
      ? `${element.group.label} excluded from folder selections`
      : `${element.group.label} included in folder selections`;
    item.contextValue = "selectionFilter";
    item.command = {
      command: "promptTower.toggleSelectionFilter",
      title: "Toggle Selection Filter",
      arguments: [element],
    };

    const resourceUri = getFilterResourceUri(element.group);
    if (resourceUri) {
      item.resourceUri = resourceUri;
    } else {
      item.iconPath = getFilterThemeIcon(element.group);
    }

    return item;
  }

  getChildren(): SelectionFilterNode[] {
    return this.fileProvider
      .getSelectionFilterGroups()
      .map((group) => ({ group }));
  }
}

function formatFilterLabel(group: SelectionFilterGroup): string {
  return group.label
    .replace(/ files$/, "")
    .replace("Test files (*.test.*, *.spec.*)", "Tests")
    .replace("Declaration files (*.d.ts)", "Types");
}

function getFilterResourceUri(group: SelectionFilterGroup): vscode.Uri | undefined {
  const extension = group.id.startsWith("extension:")
    ? group.id.slice("extension:".length)
    : undefined;

  if (!extension || extension === "(no extension)") {
    return undefined;
  }

  return vscode.Uri.file(`/__prompt_tower_filter__/filter${extension}`);
}

function getFilterThemeIcon(group: SelectionFilterGroup): vscode.ThemeIcon {
  if (group.id === "pattern:test") {
    return new vscode.ThemeIcon("beaker");
  }
  if (group.id === "pattern:declaration") {
    return new vscode.ThemeIcon("symbol-interface");
  }
  return new vscode.ThemeIcon("file");
}

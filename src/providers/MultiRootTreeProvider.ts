import * as vscode from "vscode";
import * as path from "path";
import { FileNode, FileNodeUtils } from "../models/FileNode";
import { GitHubSelectionProvider } from "../models/GitHubContext";
import {
  FileSelectionChangeEvent,
  TreeSyncStatePayload,
  WorkspaceChangeEvent,
} from "../models/Events";
import { Workspace } from "../models/Workspace";
import { WorkspaceManager } from "../services/WorkspaceManager";
import { FileDiscoveryService } from "../services/FileDiscoveryService";
import { TokenCountingService } from "../services/TokenCountingService";
import { IgnorePatternService } from "../services/IgnorePatternService";
import {
  estimateTokenCountFromBytes,
  formatTreeTokenCount,
} from "../utils/treeTokens";
import {
  getTokenProfile,
  type TokenProfile,
} from "../services/tokenProfiles";
import { getSelectionRefinementDefinition } from "../services/selectionRefinement";

const REFRESH_DEBOUNCE_MS = 300;

export interface EnsureFreshResult {
  removedSelections: string[];
}

export interface SelectionFilterGroup {
  id: string;
  label: string;
  sortLabel: string;
  totalFiles: number;
  selectedFiles: number;
  selectedTokenCount: number;
  excludedTokenCount: number;
  excluded: boolean;
}

/**
 * Tree data provider that supports multiple workspace folders
 * Replaces the monolithic PromptTowerProvider with clean architecture
 */
export class MultiRootTreeProvider
  implements vscode.TreeDataProvider<FileNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    FileNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _onDidChangeSelection =
    new vscode.EventEmitter<FileSelectionChangeEvent>();
  readonly onDidChangeSelection = this._onDidChangeSelection.event;

  private _onDidChangeSyncState =
    new vscode.EventEmitter<TreeSyncStatePayload>();
  readonly onDidChangeSyncState = this._onDidChangeSyncState.event;

  private rootNodes: FileNode[] = [];
  private isInitialized = false;
  private readonly initializationPromise: Promise<void>;
  private resolveInitialization?: () => void;
  private rejectInitialization?: (error: unknown) => void;
  private workspaceWatchers = new Map<string, vscode.FileSystemWatcher>();
  private refreshTimeout: NodeJS.Timeout | undefined;
  private refreshInFlight: Promise<EnsureFreshResult> | undefined;
  private dirtyVersion = 1;
  private lastRefreshedVersion = 0;
  private syncState: TreeSyncStatePayload["state"] = "dirty";
  private lastRefreshAt: number | undefined;

  // Configuration
  private promptPrefix: string = "";
  private promptSuffix: string = "";
  private maxFileSizeWarningKB: number = 500;
  private showTreeTokenCounts: boolean = true;
  private tokenProfile: TokenProfile = getTokenProfile(undefined);
  private excludedSelectionGroupIds = new Set<string>();

  private gitHubIssuesProvider?: GitHubSelectionProvider;

  constructor(
    private workspaceManager: WorkspaceManager,
    private fileDiscoveryService: FileDiscoveryService,
    private tokenCountingService: TokenCountingService,
    private ignorePatternService: IgnorePatternService,
    private context: vscode.ExtensionContext
  ) {
    this.initializationPromise = new Promise<void>((resolve, reject) => {
      this.resolveInitialization = resolve;
      this.rejectInitialization = reject;
    });

    this.loadConfiguration();
    this.loadSelectionFilters();
    this.setupEventListeners();
    void this.initialize();
  }

  /**
   * Initialize the provider
   */
  private async initialize(): Promise<void> {
    try {
      await this.refreshNow(true);
      this.isInitialized = true;
      this.resolveInitialization?.();
    } catch (error) {
      console.error(
        "MultiRootTreeProvider: Error during initialization:",
        error
      );
      vscode.window.showErrorMessage(
        "Error initializing Prompt Tower file view."
      );
      this.rejectInitialization?.(error);
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.workspaceManager.onDidChangeWorkspaces(async (event) => {
      this.handleWorkspaceChange(event);
      await this.refreshNow(true);
    });

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("promptTower")) {
        const previousShowTreeTokenCounts = this.showTreeTokenCounts;
        this.loadConfiguration();
        if (previousShowTreeTokenCounts !== this.showTreeTokenCounts) {
          this._onDidChangeTreeData.fire();
        }
        this.markDirty();
      }
    });

    this.ignorePatternService.onDidChangeIgnorePatterns(() => {
      this.markDirty();
    });
  }

  private handleWorkspaceChange(event: WorkspaceChangeEvent): void {
    if (event.type !== "removed") {
      return;
    }

    const watcher = this.workspaceWatchers.get(event.workspace.id);
    if (watcher) {
      watcher.dispose();
      this.workspaceWatchers.delete(event.workspace.id);
    }

    this.ignorePatternService.cleanupWorkspace(event.workspace);
  }

  private isDirty(): boolean {
    return this.dirtyVersion !== this.lastRefreshedVersion;
  }

  private emitSyncState(): void {
    this._onDidChangeSyncState.fire(this.getSyncState());
  }

  private setSyncState(state: TreeSyncStatePayload["state"]): void {
    if (this.syncState === state) {
      return;
    }

    this.syncState = state;
    this.emitSyncState();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    this.refreshTimeout = setTimeout(() => {
      this.refreshTimeout = undefined;
      void this.refreshNow();
    }, REFRESH_DEBOUNCE_MS);
  }

  private clearScheduledRefresh(): void {
    if (!this.refreshTimeout) {
      return;
    }

    clearTimeout(this.refreshTimeout);
    this.refreshTimeout = undefined;
  }

  private markDirty(): void {
    this.dirtyVersion += 1;

    if (this.syncState !== "refreshing") {
      this.setSyncState("dirty");
    }

    this.scheduleRefresh();
  }

  private setupWorkspaceWatchers(workspaces: Workspace[]): void {
    const activeWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));

    for (const workspace of workspaces) {
      this.ignorePatternService.setupIgnoreFileWatchers(workspace);

      if (this.workspaceWatchers.has(workspace.id)) {
        continue;
      }

      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspace.rootPath, "**/*"),
        false,
        false,
        false
      );

      watcher.onDidCreate(() => {
        this.markDirty();
      });
      watcher.onDidDelete(() => {
        this.markDirty();
      });
      watcher.onDidChange((uri) => {
        void this.handleFileChanged(uri.fsPath);
      });

      this.workspaceWatchers.set(workspace.id, watcher);
      this.context.subscriptions.push(watcher);
    }

    for (const [workspaceId, watcher] of this.workspaceWatchers) {
      if (activeWorkspaceIds.has(workspaceId)) {
        continue;
      }

      watcher.dispose();
      this.workspaceWatchers.delete(workspaceId);
    }
  }

  /**
   * Load configuration settings
   */
  private loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration("promptTower");
    this.maxFileSizeWarningKB = config.get<number>("maxFileSizeWarningKB", 500);
    this.showTreeTokenCounts = config.get<boolean>(
      "showTreeTokenCounts",
      true
    );
    void vscode.commands.executeCommand(
      "setContext",
      "promptTower.treeTokenCountsVisible",
      this.showTreeTokenCounts
    );
  }

  private loadSelectionFilters(): void {
    const excludedGroupIds = this.context.workspaceState.get<string[]>(
      "promptTower.excludedSelectionGroupIds",
      []
    );
    this.excludedSelectionGroupIds = new Set(excludedGroupIds);
  }

  private async persistSelectionFilters(): Promise<void> {
    await this.context.workspaceState.update(
      "promptTower.excludedSelectionGroupIds",
      [...this.excludedSelectionGroupIds]
    );
  }

  /**
   * Refresh all workspaces
   */
  private async refreshWorkspaces(): Promise<EnsureFreshResult> {
    this.clearScheduledRefresh();

    const preserveCheckedPaths = new Set<string>();
    const checkedNodes = this.getAllCheckedNodes(this.rootNodes);
    for (const checkedNode of checkedNodes) {
      preserveCheckedPaths.add(checkedNode.absolutePath);
    }

    const checkedFilePathsBeforeRefresh = FileNodeUtils.getCheckedFilePaths(
      this.rootNodes
    );
    const workspaces = this.workspaceManager.getWorkspaces();

    if (workspaces.length === 0) {
      this.rootNodes = [];
      this.tokenCountingService.clearSelection();
      this._onDidChangeTreeData.fire();
      this.lastRefreshAt = Date.now();
      this.emitSyncState();
      return { removedSelections: checkedFilePathsBeforeRefresh };
    }

    this.setupWorkspaceWatchers(workspaces);

    this.rootNodes = await this.fileDiscoveryService.discoverFiles(
      workspaces,
      preserveCheckedPaths
    );
    FileNodeUtils.recomputeEstimatedTokenCounts(this.rootNodes, this.tokenProfile);
    this.applySelectionFiltersToCurrentSelection();

    const checkedFilePathsAfterRefresh =
      FileNodeUtils.getCheckedFilePaths(this.rootNodes);
    const checkedFilePathSet = new Set(checkedFilePathsAfterRefresh);
    const removedSelections = checkedFilePathsBeforeRefresh.filter(
      (filePath) => !checkedFilePathSet.has(filePath)
    );

    this.tokenCountingService.replaceSelection(checkedFilePathsAfterRefresh);
    this._onDidChangeTreeData.fire();
    this.lastRefreshAt = Date.now();
    this.emitSyncState();

    return { removedSelections };
  }

  private async refreshNow(force: boolean = false): Promise<EnsureFreshResult> {
    if (!force && !this.isDirty() && !this.refreshInFlight) {
      return { removedSelections: [] };
    }

    this.clearScheduledRefresh();

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const refreshVersion = this.dirtyVersion;
    this.setSyncState("refreshing");

    const refreshPromise = this.refreshWorkspaces()
      .then((result) => {
        if (this.dirtyVersion === refreshVersion) {
          this.lastRefreshedVersion = refreshVersion;
          this.setSyncState("idle");
        } else {
          this.setSyncState("dirty");
          this.scheduleRefresh();
        }

        return result;
      })
      .finally(() => {
        this.refreshInFlight = undefined;
      });

    this.refreshInFlight = refreshPromise;
    return refreshPromise;
  }

  /**
   * Get all checked nodes (files and directories)
   */
  private getAllCheckedNodes(nodes: FileNode[]): FileNode[] {
    const checkedNodes: FileNode[] = [];
    const stack = [...nodes];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.isChecked) {
        checkedNodes.push(node);
      }
      if (node.children) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }

    return checkedNodes;
  }

  /**
   * Required by TreeDataProvider interface
   */
  getTreeItem(element: FileNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.label,
      element.collapsibleState
    );

    treeItem.contextValue =
      element.type === "workspace-root" ? "workspaceRoot" : element.type;
    treeItem.checkboxState = element.checkable
      ? element.isChecked
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked
      : undefined;
    treeItem.command = {
      command: "promptTower.toggleFileSelection",
      title: "Toggle Selection",
      arguments: [element],
    };

    if (element.type === "workspace-root") {
      treeItem.tooltip = `Workspace: ${element.workspace.name}\nPath: ${element.absolutePath}`;
    } else {
      treeItem.tooltip = element.absolutePath;
    }

    if (element.type === "file") {
      treeItem.resourceUri = vscode.Uri.file(element.absolutePath);
    }

    if (this.showTreeTokenCounts) {
      treeItem.description = formatTreeTokenCount(
        element.displayTokenCount,
        element.tokenCountStatus
      );
    }

    return treeItem;
  }

  private async handleFileChanged(filePath: string): Promise<void> {
    const node = this.findNodeByPath(filePath);
    if (!node || node.type !== "file") {
      return;
    }

    try {
      const stats = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      if (stats.type !== vscode.FileType.File) {
        return;
      }

      node.sizeBytes = stats.size;
      node.mtimeMs = stats.mtime;
      this.tokenCountingService.invalidateFile(filePath);
      FileNodeUtils.updateFileTokenCounts(node, {
        estimatedTokenCount: estimateTokenCountFromBytes(
          stats.size,
          this.tokenProfile,
          node.label
        ),
        exactTokenCount: undefined,
      });
      this._onDidChangeTreeData.fire();
    } catch (error) {
      console.warn(`Error refreshing token estimate for ${filePath}:`, error);
      this.markDirty();
    }
  }

  /**
   * Required by TreeDataProvider interface
   */
  async getChildren(element?: FileNode): Promise<FileNode[]> {
    if (!this.isInitialized) {
      return [];
    }

    if (!element) {
      return this.rootNodes;
    }

    return element.children || [];
  }

  /**
   * Toggle the checked state of a file node
   */
  async toggleNodeSelection(node: FileNode): Promise<void> {
    const originalState = node.isChecked;
    let newState = !originalState;
    let userCancelled = false;

    try {
      if (newState && node.type === "file") {
        await this.checkFileSize(node.absolutePath);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "User cancelled large file selection"
      ) {
        newState = false;
        userCancelled = true;
      }
    }

    if (newState !== originalState || userCancelled) {
      const checkedBefore = new Set(FileNodeUtils.getCheckedFilePaths([node]));

      this.setCheckedState(node, newState);

      this.updateAncestorCheckedStateWithFilters(node);

      const checkedAfter = new Set(FileNodeUtils.getCheckedFilePaths([node]));
      const addedFilePaths = [...checkedAfter].filter(
        (filePath) => !checkedBefore.has(filePath)
      );
      const removedFilePaths = [...checkedBefore].filter(
        (filePath) => !checkedAfter.has(filePath)
      );

      this._onDidChangeSelection.fire({
        node,
        isChecked: node.isChecked,
        addedFilePaths,
        removedFilePaths,
      });

      this.tokenCountingService.applySelectionDelta(
        addedFilePaths,
        removedFilePaths
      );

      this._onDidChangeTreeData.fire(node);
    }
  }

  getSelectionFilterGroups(): SelectionFilterGroup[] {
    const groups = new Map<string, SelectionFilterGroup>();
    const stack = [...this.rootNodes];

    while (stack.length > 0) {
      const file = stack.pop()!;
      if (file.children) {
        for (let index = file.children.length - 1; index >= 0; index--) {
          stack.push(file.children[index]);
        }
      }
      if (file.type !== "file") {
        continue;
      }

      const definition = getSelectionRefinementDefinition(file.label);
      const group = groups.get(definition.id) ?? {
        id: definition.id,
        label: definition.label,
        sortLabel: definition.sortLabel,
        totalFiles: 0,
        selectedFiles: 0,
        selectedTokenCount: 0,
        excludedTokenCount: 0,
        excluded: this.excludedSelectionGroupIds.has(definition.id),
      };
      group.totalFiles += 1;
      if (file.isChecked) {
        group.selectedFiles += 1;
        group.selectedTokenCount += file.estimatedTokenCount;
      } else if (group.excluded && this.hasCheckedAncestor(file)) {
        group.excludedTokenCount += file.estimatedTokenCount;
      }
      groups.set(definition.id, group);
    }

    return [...groups.values()]
      .filter((group) => group.selectedFiles > 0 || group.excluded)
      .sort((left, right) => {
        if (left.id.startsWith("pattern:") !== right.id.startsWith("pattern:")) {
          return left.id.startsWith("pattern:") ? 1 : -1;
        }
        return left.sortLabel.localeCompare(right.sortLabel);
      });
  }

  async setSelectionFilterExcluded(
    groupId: string,
    excluded: boolean
  ): Promise<void> {
    if (excluded) {
      this.excludedSelectionGroupIds.add(groupId);
    } else {
      this.excludedSelectionGroupIds.delete(groupId);
    }

    await this.persistSelectionFilters();

    if (excluded) {
      const removedFilePaths = this.applySelectionFiltersToCurrentSelection();
      if (removedFilePaths.length > 0) {
        this.tokenCountingService.applySelectionDelta([], removedFilePaths);
        this._onDidChangeTreeData.fire();
      }
      return;
    }

    const addedFilePaths = this.restoreFilesCoveredByCheckedAncestors(groupId);
    if (addedFilePaths.length > 0) {
      this.tokenCountingService.applySelectionDelta(addedFilePaths, []);
    }
    this._onDidChangeTreeData.fire();
  }

  async resetSelectionFilters(): Promise<void> {
    if (this.excludedSelectionGroupIds.size === 0) {
      return;
    }

    this.excludedSelectionGroupIds.clear();
    await this.persistSelectionFilters();
    const addedFilePaths = this.restoreFilesCoveredByCheckedAncestors();
    if (addedFilePaths.length > 0) {
      this.tokenCountingService.applySelectionDelta(addedFilePaths, []);
    }
    this._onDidChangeTreeData.fire();
  }

  private setCheckedState(node: FileNode, checked: boolean): void {
    if (!checked) {
      FileNodeUtils.toggleCheckedState(node, false);
      return;
    }

    this.setCheckedStateWithFilters(node);
  }

  private setCheckedStateWithFilters(node: FileNode): boolean {
    if (node.type === "file") {
      const selectable = !this.isFileExcludedBySelectionFilters(node);
      node.isChecked = selectable;
      return selectable;
    }

    let allChildrenChecked = true;
    let hasSelectableChildren = false;
    for (const child of node.children ?? []) {
      const childHasSelectableFiles = this.setCheckedStateWithFilters(child);
      if (!childHasSelectableFiles) {
        continue;
      }
      hasSelectableChildren = true;
      allChildrenChecked = child.isChecked && allChildrenChecked;
    }
    node.isChecked = hasSelectableChildren && allChildrenChecked;
    return hasSelectableChildren;
  }

  private applySelectionFiltersToCurrentSelection(): string[] {
    const removedFilePaths: string[] = [];

    for (const file of FileNodeUtils.getCheckedFiles(this.rootNodes)) {
      if (!this.isFileExcludedBySelectionFilters(file)) {
        continue;
      }

      file.isChecked = false;
      removedFilePaths.push(file.absolutePath);
    }

    for (const rootNode of this.rootNodes) {
      this.updateCheckedStateFromChildrenWithFilters(rootNode);
    }

    return removedFilePaths;
  }

  private restoreFilesCoveredByCheckedAncestors(groupId?: string): string[] {
    const addedFilePaths: string[] = [];

    for (const rootNode of this.rootNodes) {
      this.restoreFilesCoveredByCheckedAncestorsInNode(
        rootNode,
        false,
        groupId,
        addedFilePaths
      );
      this.updateCheckedStateFromChildrenWithFilters(rootNode);
    }

    return addedFilePaths;
  }

  private restoreFilesCoveredByCheckedAncestorsInNode(
    node: FileNode,
    hasCheckedAncestor: boolean,
    groupId: string | undefined,
    addedFilePaths: string[]
  ): void {
    if (node.type === "file") {
      if (!hasCheckedAncestor || this.isFileExcludedBySelectionFilters(node)) {
        return;
      }

      const definition = getSelectionRefinementDefinition(node.label);
      if (groupId !== undefined && definition.id !== groupId) {
        return;
      }

      if (!node.isChecked) {
        node.isChecked = true;
        addedFilePaths.push(node.absolutePath);
      }
      return;
    }

    const childHasCheckedAncestor = hasCheckedAncestor || node.isChecked;
    for (const child of node.children ?? []) {
      this.restoreFilesCoveredByCheckedAncestorsInNode(
        child,
        childHasCheckedAncestor,
        groupId,
        addedFilePaths
      );
    }
  }

  private updateCheckedStateFromChildrenWithFilters(node: FileNode): boolean {
    if (node.type === "file") {
      return !this.isFileExcludedBySelectionFilters(node);
    }

    let hasSelectableChildren = false;
    let allSelectableChildrenChecked = true;

    for (const child of node.children ?? []) {
      const childHasSelectableFiles =
        this.updateCheckedStateFromChildrenWithFilters(child);
      if (!childHasSelectableFiles) {
        continue;
      }

      hasSelectableChildren = true;
      allSelectableChildrenChecked =
        child.isChecked && allSelectableChildrenChecked;
    }

    node.isChecked = hasSelectableChildren && allSelectableChildrenChecked;
    return hasSelectableChildren;
  }

  private updateAncestorCheckedStateWithFilters(node: FileNode): void {
    let ancestor = node.parent;

    while (ancestor) {
      this.updateSingleNodeCheckedStateFromChildrenWithFilters(ancestor);
      ancestor = ancestor.parent;
    }
  }

  private updateSingleNodeCheckedStateFromChildrenWithFilters(
    node: FileNode
  ): void {
    if (node.type === "file") {
      return;
    }

    let hasSelectableChildren = false;
    let allSelectableChildrenChecked = true;

    for (const child of node.children ?? []) {
      if (!this.hasSelectableFiles(child)) {
        continue;
      }

      hasSelectableChildren = true;
      allSelectableChildrenChecked =
        child.isChecked && allSelectableChildrenChecked;
    }

    node.isChecked = hasSelectableChildren && allSelectableChildrenChecked;
  }

  private hasSelectableFiles(node: FileNode): boolean {
    if (node.type === "file") {
      return !this.isFileExcludedBySelectionFilters(node);
    }

    for (const child of node.children ?? []) {
      if (this.hasSelectableFiles(child)) {
        return true;
      }
    }

    return false;
  }

  private hasCheckedAncestor(node: FileNode): boolean {
    let ancestor = node.parent;

    while (ancestor) {
      if (ancestor.isChecked) {
        return true;
      }
      ancestor = ancestor.parent;
    }

    return false;
  }

  private isFileExcludedBySelectionFilters(file: FileNode): boolean {
    return this.excludedSelectionGroupIds.has(
      getSelectionRefinementDefinition(file.label).id
    );
  }

  /**
   * Check file size and warn user about large files
   */
  private async checkFileSize(filePath: string): Promise<void> {
    try {
      const stats = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      const fileSizeKB = stats.size / 1024;

      if (fileSizeKB > this.maxFileSizeWarningKB) {
        const proceed = await vscode.window.showWarningMessage(
          `File "${path.basename(filePath)}" is ${Math.round(
            fileSizeKB
          )}KB, which exceeds the warning threshold (${
            this.maxFileSizeWarningKB
          }KB). This may impact performance.`,
          "Select Anyway",
          "Cancel"
        );

        if (proceed !== "Select Anyway") {
          throw new Error("User cancelled large file selection");
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "User cancelled large file selection"
      ) {
        throw error;
      }
    }
  }

  /**
   * Clear all selections
   */
  clearAllSelections(): void {
    const removedFilePaths = FileNodeUtils.getCheckedFilePaths(this.rootNodes);
    let hasFileChanges = false;
    if (removedFilePaths.length > 0) {
      for (const rootNode of this.rootNodes) {
        FileNodeUtils.toggleCheckedState(rootNode, false);
      }
      hasFileChanges = true;
    }

    let hasIssueChanges = false;
    if (this.gitHubIssuesProvider) {
      const hadIssues = this.gitHubIssuesProvider.getSelectedCount() > 0;
      this.gitHubIssuesProvider.clearAllSelections();
      hasIssueChanges = hadIssues;
    }

    if (hasFileChanges || hasIssueChanges) {
      if (hasFileChanges) {
        this.tokenCountingService.clearSelection();
      }
      this._onDidChangeTreeData.fire();
      vscode.window.showInformationMessage("Cleared all selections.");
    }
  }

  /**
   * Toggle all files in all workspaces
   */
  async toggleAllFiles(): Promise<void> {
    const checkedFilePaths = FileNodeUtils.getCheckedFilePaths(this.rootNodes);
    const selectableFilePaths = this.getSelectableFilePaths();
    const allSelected = checkedFilePaths.length === selectableFilePaths.length;

    const newState = !allSelected;
    const affectedFilePaths = newState ? selectableFilePaths : checkedFilePaths;

    for (const rootNode of this.rootNodes) {
      this.setCheckedState(rootNode, newState);
    }

    if (newState) {
      this.tokenCountingService.replaceSelection(affectedFilePaths);
    } else {
      this.tokenCountingService.clearSelection();
    }

    this._onDidChangeTreeData.fire();
  }

  /**
   * Get total count of all files across all workspaces
   */
  private getSelectableFilePaths(): string[] {
    const filePaths: string[] = [];
    const stack = [...this.rootNodes];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.type === "file" && !this.isFileExcludedBySelectionFilters(node)) {
        filePaths.push(node.absolutePath);
      }
      if (node.children) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }
    return filePaths;
  }

  /**
   * Get all currently checked files
   */
  getCheckedFiles(): FileNode[] {
    return FileNodeUtils.getCheckedFiles(this.rootNodes);
  }

  /**
   * Get all root nodes (workspace roots)
   */
  getRootNodes(): FileNode[] {
    return this.rootNodes;
  }

  setTokenProfile(profile: TokenProfile): void {
    this.tokenProfile = profile;
    FileNodeUtils.recomputeEstimatedTokenCounts(this.rootNodes, profile);
    this._onDidChangeTreeData.fire();
  }

  getSelectedFileBlockCharacterEstimate(minify: boolean): number {
    return FileNodeUtils.getCheckedFiles(this.rootNodes).reduce((total, node) => {
      const sourcePath = "/" + node.relativePath.replace(/\\/g, "/");
      const contentLength = node.sizeBytes ?? 0;

      if (minify) {
        return total + `<file path="${sourcePath}">`.length + contentLength + "</file>".length;
      }

      return (
        total +
        `<file name="${node.label}" path="${sourcePath}">\n`.length +
        contentLength +
        "\n</file>".length
      );
    }, 0);
  }

  /**
   * Find a node by its absolute path
   */
  findNodeByPath(absolutePath: string): FileNode | undefined {
    return this.fileDiscoveryService.findNodeByPath(
      this.rootNodes,
      absolutePath
    );
  }

  /**
   * Refresh the tree (public method for commands)
   */
  async refresh(): Promise<void> {
    await this.refreshNow(true);
  }

  async ensureFresh(): Promise<EnsureFreshResult> {
    await this.initializationPromise;

    const removedSelections = new Set<string>();

    while (true) {
      if (this.refreshInFlight) {
        const result = await this.refreshInFlight;
        for (const removedSelection of result.removedSelections) {
          removedSelections.add(removedSelection);
        }
        if (!this.isDirty()) {
          return { removedSelections: [...removedSelections] };
        }
        continue;
      }

      if (!this.isDirty()) {
        return { removedSelections: [...removedSelections] };
      }

      const result = await this.refreshNow();
      for (const removedSelection of result.removedSelections) {
        removedSelections.add(removedSelection);
      }
    }
  }

  getSyncState(): TreeSyncStatePayload {
    return {
      state: this.syncState,
      lastRefreshAt: this.lastRefreshAt,
    };
  }

  /**
   * Set prompt prefix
   */
  setPromptPrefix(text: string): void {
    this.promptPrefix = text || "";
  }

  /**
   * Set prompt suffix
   */
  setPromptSuffix(text: string): void {
    this.promptSuffix = text || "";
  }

  /**
   * Get prompt prefix
   */
  getPromptPrefix(): string {
    return this.promptPrefix;
  }

  /**
   * Get prompt suffix
   */
  getPromptSuffix(): string {
    return this.promptSuffix;
  }

  /**
   * Get current token counting service
   */
  getTokenCountingService(): TokenCountingService {
    return this.tokenCountingService;
  }

  areTreeTokenCountsVisible(): boolean {
    return this.showTreeTokenCounts;
  }

  /**
   * Get workspace manager
   */
  getWorkspaceManager(): WorkspaceManager {
    return this.workspaceManager;
  }

  /**
   * Reset all state (for commands)
   */
  resetAll(): void {
    this.clearAllSelections();
    this.setPromptPrefix("");
    this.setPromptSuffix("");
  }

  /**
   * Set the GitHub issues provider for integration
   */
  setGitHubIssuesProvider(provider: GitHubSelectionProvider): void {
    this.gitHubIssuesProvider = provider;

    provider.onDidChangeTokens((update) => {
      this.tokenCountingService.setGitHubIssueTokens(
        update.totalTokens,
        update.isCounting
      );
    });
  }

  /**
   * Get GitHub issues provider
   */
  getGitHubIssuesProvider(): GitHubSelectionProvider | undefined {
    return this.gitHubIssuesProvider;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.clearScheduledRefresh();
    for (const watcher of this.workspaceWatchers.values()) {
      watcher.dispose();
    }
    this.workspaceWatchers.clear();
    this._onDidChangeTreeData.dispose();
    this._onDidChangeSelection.dispose();
    this._onDidChangeSyncState.dispose();
    this.tokenCountingService.dispose();
    this.ignorePatternService.dispose();
    this.workspaceManager.dispose();
  }
}

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

const REFRESH_DEBOUNCE_MS = 300;

export interface EnsureFreshResult {
  removedSelections: string[];
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
        this.loadConfiguration();
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
        true,
        false
      );

      watcher.onDidCreate(() => {
        this.markDirty();
      });
      watcher.onDidDelete(() => {
        this.markDirty();
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

    treeItem.contextValue = element.type;
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

    return treeItem;
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
      const addedFilePaths = newState
        ? FileNodeUtils.getUncheckedFilePaths([node])
        : [];
      const removedFilePaths = newState
        ? []
        : FileNodeUtils.getCheckedFilePaths([node]);

      FileNodeUtils.toggleCheckedState(node, newState);

      if (node.parent) {
        FileNodeUtils.updateParentCheckedState(node);
      }

      this._onDidChangeSelection.fire({
        node,
        isChecked: newState,
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
    const totalFiles = this.getAllFileCount();
    const allSelected = checkedFilePaths.length === totalFiles;

    const newState = !allSelected;
    const affectedFilePaths = newState
      ? FileNodeUtils.getFilePaths(this.rootNodes)
      : checkedFilePaths;

    for (const rootNode of this.rootNodes) {
      FileNodeUtils.toggleCheckedState(rootNode, newState);
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
  private getAllFileCount(): number {
    let count = 0;
    const stack = [...this.rootNodes];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.type === "file") {
        count++;
      }
      if (node.children) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }
    return count;
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

import * as vscode from "vscode";
import * as path from "path";
import { FileNode, FileNodeUtils } from "../models/FileNode";
import { GitHubSelectionProvider } from "../models/GitHubContext";
import { FileSelectionChangeEvent } from "../models/Events";
import { WorkspaceManager } from "../services/WorkspaceManager";
import { FileDiscoveryService } from "../services/FileDiscoveryService";
import { TokenCountingService } from "../services/TokenCountingService";
import { IgnorePatternService } from "../services/IgnorePatternService";

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

  private rootNodes: FileNode[] = [];
  private isInitialized = false;

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
    this.loadConfiguration();
    this.setupEventListeners();
    this.initialize();
  }

  /**
   * Initialize the provider
   */
  private async initialize(): Promise<void> {
    try {
      await this.refreshWorkspaces();
      this.isInitialized = true;
    } catch (error) {
      console.error(
        "MultiRootTreeProvider: Error during initialization:",
        error
      );
      vscode.window.showErrorMessage(
        "Error initializing Prompt Tower file view."
      );
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for workspace changes
    this.workspaceManager.onDidChangeWorkspaces(async (event) => {
      await this.refreshWorkspaces();
    });

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("promptTower")) {
        this.loadConfiguration();
        this.refreshWorkspaces();
      }
    });
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
  async refreshWorkspaces(): Promise<void> {
    // Preserve currently checked paths (both files and directories)
    const preserveCheckedPaths = new Set<string>();
    const checkedNodes = this.getAllCheckedNodes(this.rootNodes);
    for (const checkedNode of checkedNodes) {
      preserveCheckedPaths.add(checkedNode.absolutePath);
    }

    // Get current workspaces
    const workspaces = this.workspaceManager.getWorkspaces();

    if (workspaces.length === 0) {
      this.rootNodes = [];
      this.tokenCountingService.clearSelection();
      this._onDidChangeTreeData.fire();
      return;
    }

    // Setup ignore file watchers for each workspace
    for (const workspace of workspaces) {
      this.ignorePatternService.setupIgnoreFileWatchers(workspace);
    }

    // Discover files for all workspaces
    this.rootNodes = await this.fileDiscoveryService.discoverFiles(
      workspaces,
      preserveCheckedPaths
    );

    this.tokenCountingService.replaceSelection(
      FileNodeUtils.getCheckedFilePaths(this.rootNodes)
    );

    // Refresh the tree view
    this._onDidChangeTreeData.fire();

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

    // Set context value for commands
    treeItem.contextValue = element.type;

    // Set checkbox state (visual indicator only)
    treeItem.checkboxState = element.checkable
      ? element.isChecked
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked
      : undefined;

    // Make whole row clickable via command (for all node types)
    treeItem.command = {
      command: "promptTower.toggleFileSelection",
      title: "Toggle Selection",
      arguments: [element]
    };

    // Set tooltip
    if (element.type === "workspace-root") {
      treeItem.tooltip = `Workspace: ${element.workspace.name}\nPath: ${element.absolutePath}`;
    } else {
      treeItem.tooltip = element.absolutePath;
    }

    // Set icon theme for files
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
      // Return workspace root nodes
      return this.rootNodes;
    }

    // Return children of the given element
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
      // Check file size for large files
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

    // Update the node state
    if (newState !== originalState || userCancelled) {
      const addedFilePaths = newState
        ? FileNodeUtils.getUncheckedFilePaths([node])
        : [];
      const removedFilePaths = newState
        ? []
        : FileNodeUtils.getCheckedFilePaths([node]);

      // Toggle this node and its children
      FileNodeUtils.toggleCheckedState(node, newState);

      // Update parent states
      if (node.parent) {
        FileNodeUtils.updateParentCheckedState(node);
      }

      // Emit selection change event
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

      // Refresh the tree to show updated checkboxes
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
      // Silently ignore other errors (file might not exist, etc.)
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

    // Also clear GitHub issues if provider is available
    let hasIssueChanges = false;
    if (
      this.gitHubIssuesProvider
    ) {
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

    // Refresh tree
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
    await this.refreshWorkspaces();
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
    this.clearAllSelections(); // This now clears both files and GitHub issues
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
    this._onDidChangeTreeData.dispose();
    this._onDidChangeSelection.dispose();
    this.tokenCountingService.dispose();
    this.ignorePatternService.dispose();
    this.workspaceManager.dispose();
  }
}

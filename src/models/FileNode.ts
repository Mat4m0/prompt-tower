import * as vscode from "vscode";
import * as path from "path";
import { Workspace } from "./Workspace";
import {
  estimateTokenCountFromBytes,
  recomputeTreeTokenCounts,
  updateLeafTreeTokenCounts,
} from "../utils/treeTokens";
import type { TokenProfile } from "../services/tokenProfiles";

/**
 * Represents a file or directory node in the multi-workspace tree
 */
export interface FileNode {
  /** Unique identifier for this node */
  id: string;

  /** Display label for the tree item */
  label: string;

  /** Absolute file system path */
  absolutePath: string;

  /** Path relative to workspace root */
  relativePath: string;

  /** The workspace this node belongs to */
  workspace: Workspace;

  /** Whether this is a file or directory */
  type: "file" | "directory" | "workspace-root";

  /** Whether this node is checked/selected */
  isChecked: boolean;

  /** Whether this node can be checked */
  checkable: boolean;

  /** Child nodes (for directories) */
  children?: FileNode[];

  /** VS Code tree item collapsible state */
  collapsibleState: vscode.TreeItemCollapsibleState;

  /** File extension (for files only) */
  extension?: string;

  /** File size in bytes (for files only) */
  sizeBytes?: number;

  /** Last modified timestamp in milliseconds (for files only) */
  mtimeMs?: number;

  /** Fast size-based token estimate for this file or subtree. */
  estimatedTokenCount: number;

  /** Exact tokenizer count when already available from selection counting. */
  exactTokenCount?: number;

  /** Display count shown in the tree; exact for fully exact nodes, otherwise estimated. */
  displayTokenCount: number;

  /** Whether displayTokenCount is exact or estimated. */
  tokenCountStatus: "estimated" | "exact";

  /** Whether this node should be visible in the tree */
  visible: boolean;

  /** Parent node (null for workspace roots) */
  parent?: FileNode;
}

/**
 * Factory for creating FileNode instances
 */
export class FileNodeFactory {
  /**
   * Creates a workspace root node
   */
  static createWorkspaceRoot(workspace: Workspace): FileNode {
    return {
      id: `workspace:${workspace.id}`,
      label: workspace.name,
      absolutePath: workspace.rootPath,
      relativePath: "",
      workspace,
      type: "workspace-root",
      isChecked: false,
      checkable: true,
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      visible: true,
      children: [],
      estimatedTokenCount: 0,
      displayTokenCount: 0,
      tokenCountStatus: "estimated",
    };
  }

  /**
   * Creates a file node
   */
  static createFileNode(
    absolutePath: string,
    relativePath: string,
    workspace: Workspace,
    parent?: FileNode,
    sizeBytes: number = 0,
    mtimeMs?: number
  ): FileNode {
    const labelBasename = path.basename(absolutePath);
    const label = labelBasename;
    const extension = label.includes(".") ? label.split(".").pop() : undefined;
    const estimatedTokenCount = estimateTokenCountFromBytes(
      sizeBytes,
      undefined,
      label
    );

    return {
      id: `file:${workspace.id}:${relativePath}`,
      label,
      absolutePath,
      relativePath,
      workspace,
      type: "file",
      isChecked: false,
      checkable: true,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      extension,
      sizeBytes,
      mtimeMs,
      estimatedTokenCount,
      displayTokenCount: estimatedTokenCount,
      tokenCountStatus: "estimated",
      visible: true,
      parent,
    };
  }

  /**
   * Creates a directory node
   */
  static createDirectoryNode(
    absolutePath: string,
    relativePath: string,
    workspace: Workspace,
    parent?: FileNode
  ): FileNode {
    const labelBasename = path.basename(absolutePath);
    const label = labelBasename;

    return {
      id: `dir:${workspace.id}:${relativePath}`,
      label,
      absolutePath,
      relativePath,
      workspace,
      type: "directory",
      isChecked: false,
      checkable: true,
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      visible: true,
      parent,
      children: [],
      estimatedTokenCount: 0,
      displayTokenCount: 0,
      tokenCountStatus: "estimated",
    };
  }
}

/**
 * Utility functions for working with FileNodes
 */
export class FileNodeUtils {
  private static collectFileNodes(
    nodes: FileNode[],
    predicate?: (node: FileNode) => boolean
  ): FileNode[] {
    const fileNodes: FileNode[] = [];
    const stack = [...nodes];

    while (stack.length > 0) {
      const node = stack.pop()!;

      if (
        node.type === "file" &&
        (predicate === undefined || predicate(node))
      ) {
        fileNodes.push(node);
      }

      if (node.children) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }

    return fileNodes;
  }

  /**
   * Gets all descendant file nodes
   */
  static getDescendantFiles(node: FileNode): FileNode[] {
    return this.collectFileNodes([node]);
  }

  /**
   * Gets all checked file nodes
   */
  static getCheckedFiles(nodes: FileNode[]): FileNode[] {
    return this.collectFileNodes(nodes, (node) => node.isChecked);
  }

  /**
   * Gets all file paths in the provided nodes
   */
  static getFilePaths(nodes: FileNode[]): string[] {
    return this.collectFileNodes(nodes).map((node) => node.absolutePath);
  }

  /**
   * Gets all checked file paths in the provided nodes
   */
  static getCheckedFilePaths(nodes: FileNode[]): string[] {
    return this.collectFileNodes(nodes, (node) => node.isChecked).map(
      (node) => node.absolutePath
    );
  }

  /**
   * Gets all unchecked file paths in the provided nodes
   */
  static getUncheckedFilePaths(nodes: FileNode[]): string[] {
    return this.collectFileNodes(nodes, (node) => !node.isChecked).map(
      (node) => node.absolutePath
    );
  }

  /**
   * Toggles the checked state of a node and its children
   */
  static toggleCheckedState(node: FileNode, checked: boolean): void {
    const stack: FileNode[] = [node];

    while (stack.length > 0) {
      const currentNode = stack.pop()!;
      currentNode.isChecked = checked;

      if (currentNode.children) {
        for (let index = currentNode.children.length - 1; index >= 0; index--) {
          stack.push(currentNode.children[index]);
        }
      }
    }
  }

  /**
   * Updates parent checked state based on children
   */
  static updateParentCheckedState(node: FileNode): void {
    if (!node.parent || !node.parent.children) {
      return;
    }

    const checkedChildren = node.parent.children.filter(
      (child) => child.isChecked
    );
    const allChecked = checkedChildren.length === node.parent.children.length;

    // For simplicity, parent is checked if all children are checked
    node.parent.isChecked = allChecked;

    // Recurse up the tree
    this.updateParentCheckedState(node.parent);
  }

  /**
   * Recomputes checked state for a subtree from child states, then updates ancestors.
   */
  static updateCheckedStateFromChildren(node: FileNode): void {
    if (!node.children || node.children.length === 0) {
      if (node.parent) {
        this.updateParentCheckedState(node);
      }
      return;
    }

    for (const child of node.children) {
      this.updateCheckedStateFromChildren(child);
    }

    node.isChecked = node.children.every((child) => child.isChecked);

    if (node.parent) {
      this.updateParentCheckedState(node);
    }
  }

  /**
   * Recomputes display token totals for a subtree from child values.
   */
  static recomputeTokenCounts(node: FileNode): void {
    recomputeTreeTokenCounts(node);
  }

  /**
   * Applies a file-level display token change and updates ancestor totals by delta.
   */
  static updateFileTokenCounts(
    fileNode: FileNode,
    update: {
      estimatedTokenCount?: number;
      exactTokenCount?: number | undefined;
    }
  ): void {
    if (fileNode.type !== "file") {
      return;
    }

    updateLeafTreeTokenCounts(fileNode, update);
  }

  /**
   * Recomputes profile-specific estimates for every file and derived folder total.
   */
  static recomputeEstimatedTokenCounts(
    nodes: FileNode[],
    profile: TokenProfile
  ): void {
    const stack = [...nodes];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.type === "file") {
        node.estimatedTokenCount = estimateTokenCountFromBytes(
          node.sizeBytes ?? 0,
          profile,
          node.label
        );
        node.exactTokenCount = undefined;
        node.displayTokenCount = node.estimatedTokenCount;
        node.tokenCountStatus = "estimated";
      }

      if (node.children) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }

    for (const node of nodes) {
      recomputeTreeTokenCounts(node);
    }
  }
}

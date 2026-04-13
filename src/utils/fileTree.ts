import fs from "fs";
import path from "path";

const FOLDER_SIZE_KEY = "__folder_size__";
const FOLDER_FILE_COUNT_KEY = "__folder_file_count__";

interface TreeNode {
  [key: string]: TreeNode | number;
}

interface FileTreeEntry {
  origin: string;
  tree: string;
}

function bytesToString(bytes: number): string {
  if (bytes > 1048576) {
    return `${Math.round(bytes / 10485.76) / 100} MB`;
  }

  return `${Math.round(bytes / 10.24) / 100} KB`;
}

function createDirectoryNode(): TreeNode {
  return {
    [FOLDER_SIZE_KEY]: 0,
    [FOLDER_FILE_COUNT_KEY]: 0,
  };
}

function getNodeMetric(node: TreeNode, key: string): number {
  return (node[key] as number) || 0;
}

function isDirectoryEntry(entry: FileTreeEntry): boolean {
  return entry.tree.endsWith("/");
}

function getMaxDepth(
  depthCounts: number[],
  printLinesLimit: number
): number {
  let currentDepth = 0;
  let countUpToCurrentDepth = (depthCounts[0] || 0) + 1;

  for (let depth = 1; depth < depthCounts.length; depth++) {
    if (countUpToCurrentDepth + depthCounts[depth] > printLinesLimit) {
      break;
    }
    currentDepth = depth;
    countUpToCurrentDepth += depthCounts[depth];
  }

  return currentDepth;
}

function addEntryToTree(
  root: TreeNode,
  entry: FileTreeEntry,
  depthCounts: number[]
): void {
  const normalizedPath = entry.tree.replace(/\/+$/, "");
  if (!normalizedPath) {
    return;
  }

  const parts = normalizedPath.split("/").filter(Boolean);
  const directoryEntry = isDirectoryEntry(entry);
  let currentNode = root;

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const isLeaf = index === parts.length - 1;

    if (isLeaf && !directoryEntry) {
      if (typeof currentNode[part] !== "number") {
        currentNode[part] = 0;
        depthCounts[index] = (depthCounts[index] || 0) + 1;
      }
      return;
    }

    if (typeof currentNode[part] === "number") {
      throw new Error(`Invalid file tree structure for ${entry.tree}`);
    }

    if (!currentNode[part]) {
      currentNode[part] = createDirectoryNode();
      depthCounts[index] = (depthCounts[index] || 0) + 1;
    }

    const nextNode = currentNode[part] as TreeNode;
    if (!isLeaf || directoryEntry) {
      nextNode[FOLDER_FILE_COUNT_KEY] =
        getNodeMetric(nextNode, FOLDER_FILE_COUNT_KEY) +
        (directoryEntry && isLeaf ? 0 : 1);
    }
    currentNode = nextNode;
  }
}

function applyFileSizes(
  root: TreeNode,
  fileSizes: Array<{ tree: string; size: number }>
): void {
  for (const fileSize of fileSizes) {
    const parts = fileSize.tree.split("/").filter(Boolean);
    let currentNode = root;

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      const isLeaf = index === parts.length - 1;

      if (isLeaf) {
        currentNode[part] = fileSize.size;
        continue;
      }

      const nextNode = currentNode[part];
      if (!nextNode || typeof nextNode === "number") {
        throw new Error(`Invalid file tree structure for ${fileSize.tree}`);
      }

      nextNode[FOLDER_SIZE_KEY] =
        getNodeMetric(nextNode, FOLDER_SIZE_KEY) + fileSize.size;
      currentNode = nextNode;
    }
  }
}

async function collectFileSizes(
  entries: FileTreeEntry[]
): Promise<Array<{ tree: string; size: number }>> {
  const fileEntries = entries.filter((entry) => !isDirectoryEntry(entry));
  const stats = await Promise.all(
    fileEntries.map(async (entry) => {
      try {
        const fileStat = await fs.promises.stat(entry.origin);
        return {
          tree: entry.tree,
          size: fileStat.isFile() ? fileStat.size : 0,
        };
      } catch {
        return {
          tree: entry.tree,
          size: 0,
        };
      }
    })
  );

  return stats;
}

function renderTree(
  node: TreeNode,
  maxDepth: number,
  showFileSize: boolean,
  depth = 0,
  prefix = ""
): string[] {
  const keys = Object.keys(node)
    .filter(
      (key) => key !== FOLDER_SIZE_KEY && key !== FOLDER_FILE_COUNT_KEY
    )
    .sort((left, right) => {
      const leftIsDirectory = typeof node[left] !== "number";
      const rightIsDirectory = typeof node[right] !== "number";

      if (leftIsDirectory !== rightIsDirectory) {
        return leftIsDirectory ? 1 : -1;
      }

      return left.localeCompare(right);
    });

  const lines: string[] = [];

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const child = node[key];
    const isLast = index === keys.length - 1;
    const branchPrefix = prefix + (isLast ? "└─ " : "├─ ");
    const childPrefix = prefix + (isLast ? "   " : "│  ");

    if (typeof child === "number") {
      const fileSizeSuffix = showFileSize ? ` [${bytesToString(child)}]` : "";
      lines.push(`${branchPrefix}${key}${fileSizeSuffix}`);
      continue;
    }

    if (depth < maxDepth) {
      lines.push(`${branchPrefix}${key}/`);
      lines.push(...renderTree(child, maxDepth, showFileSize, depth + 1, childPrefix));
      continue;
    }

    const fileCount = getNodeMetric(child, FOLDER_FILE_COUNT_KEY);
    const fileCountSuffix = ` (${fileCount} ${fileCount === 1 ? "file" : "files"})`;
    const folderSizeSuffix = showFileSize
      ? ` [${bytesToString(getNodeMetric(child, FOLDER_SIZE_KEY))}]`
      : "";
    lines.push(`${branchPrefix}${key}/${fileCountSuffix}${folderSizeSuffix}`);
  }

  return lines;
}

export async function generateFileStructureTree(
  rootFolder: string,
  filePaths: FileTreeEntry[],
  printLinesLimit: number = Number.MAX_VALUE,
  options: { showFileSize?: boolean } = { showFileSize: false }
): Promise<string> {
  const folderTree = createDirectoryNode();
  const depthCounts: number[] = [];

  for (const filePath of filePaths) {
    addEntryToTree(folderTree, filePath, depthCounts);
  }

  if (options.showFileSize) {
    const fileSizes = await collectFileSizes(filePaths);
    applyFileSizes(folderTree, fileSizes);
  }

  const maxDepth = getMaxDepth(depthCounts, printLinesLimit);
  const rootFolderName = path.basename(rootFolder);
  const outputLines = [
    rootFolderName,
    ...renderTree(folderTree, maxDepth, options.showFileSize ?? false),
  ];

  return outputLines.join("\n");
}

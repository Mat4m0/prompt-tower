import {
  estimateTokensFromBytes,
  getTokenProfile,
  type TokenProfile,
} from "./TokenProfiles";

export type TreeTokenStatus = "estimated" | "exact";

export interface TreeTokenNode<TNode extends TreeTokenNode<TNode>> {
  estimatedTokenCount: number;
  exactTokenCount?: number;
  displayTokenCount: number;
  tokenCountStatus: TreeTokenStatus;
  children?: TNode[];
  parent?: TNode;
}

export function estimateTokenCountFromBytes(
  byteSize: number,
  profile: TokenProfile = getTokenProfile(undefined),
  fileName?: string
): number {
  return estimateTokensFromBytes(byteSize, profile, fileName);
}

export function formatTreeTokenCount(
  tokenCount: number,
  status: TreeTokenStatus
): string {
  const normalizedCount = Math.max(0, Math.round(tokenCount));
  const prefix = status === "estimated" ? "~" : "";

  if (normalizedCount >= 1_000_000) {
    return `${prefix}${formatCompactNumber(normalizedCount / 1_000_000)}m`;
  }

  if (normalizedCount >= 1_000) {
    return `${prefix}${formatCompactNumber(normalizedCount / 1_000)}k`;
  }

  return `${prefix}${normalizedCount}`;
}

export function recomputeTreeTokenCounts<TNode extends TreeTokenNode<TNode>>(
  node: TNode
): void {
  if (!node.children) {
    node.displayTokenCount = node.exactTokenCount ?? node.estimatedTokenCount;
    node.tokenCountStatus =
      node.exactTokenCount === undefined ? "estimated" : "exact";
    return;
  }

  let estimatedTokenCount = 0;
  let displayTokenCount = 0;
  let allChildrenExact = node.children.length > 0;

  for (const child of node.children) {
    recomputeTreeTokenCounts(child);
    estimatedTokenCount += child.estimatedTokenCount;
    displayTokenCount += child.displayTokenCount;
    allChildrenExact &&= child.tokenCountStatus === "exact";
  }

  node.estimatedTokenCount = estimatedTokenCount;
  node.displayTokenCount = displayTokenCount;
  node.tokenCountStatus = allChildrenExact ? "exact" : "estimated";
}

export function updateLeafTreeTokenCounts<TNode extends TreeTokenNode<TNode>>(
  node: TNode,
  update: { estimatedTokenCount?: number; exactTokenCount?: number | undefined }
): void {
  const previousEstimatedCount = node.estimatedTokenCount;
  const previousDisplayCount = node.displayTokenCount;

  if (update.estimatedTokenCount !== undefined) {
    node.estimatedTokenCount = update.estimatedTokenCount;
  }

  if (Object.prototype.hasOwnProperty.call(update, "exactTokenCount")) {
    node.exactTokenCount = update.exactTokenCount;
  }

  node.displayTokenCount = node.exactTokenCount ?? node.estimatedTokenCount;
  node.tokenCountStatus =
    node.exactTokenCount === undefined ? "estimated" : "exact";

  const estimatedDelta = node.estimatedTokenCount - previousEstimatedCount;
  const displayDelta = node.displayTokenCount - previousDisplayCount;

  let parent = node.parent;
  while (parent) {
    parent.estimatedTokenCount += estimatedDelta;
    parent.displayTokenCount += displayDelta;
    const children = parent.children ?? [];
    parent.tokenCountStatus =
      children.length > 0 &&
      children.every((child) => child.tokenCountStatus === "exact")
        ? "exact"
        : "estimated";
    parent = parent.parent;
  }
}

function formatCompactNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

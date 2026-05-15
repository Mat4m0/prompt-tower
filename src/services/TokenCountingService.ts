import * as vscode from "vscode";
import { TokenUpdatePayload } from "../models/Events";
import { FileSnapshotService } from "./FileSnapshotService";
import { countTextTokens } from "./tokenizer";
import { TokenSelectionState } from "./TokenSelectionState";

interface CachedTokenCount {
  mtimeMs: number;
  size: number;
  tokenCount: number;
}

export interface FileTokenCountUpdate {
  filePath: string;
  tokenCount: number;
}

/**
 * Service for counting tokens in selected files using selection deltas.
 */
export class TokenCountingService {
  private _onDidChangeTokens = new vscode.EventEmitter<TokenUpdatePayload>();
  readonly onDidChangeTokens = this._onDidChangeTokens.event;
  private _onDidResolveFileTokens =
    new vscode.EventEmitter<FileTokenCountUpdate>();
  readonly onDidResolveFileTokens = this._onDidResolveFileTokens.event;

  private githubIssueTokens = 0;
  private isCountingGitHubIssues = false;
  private readonly tokenCache = new Map<string, CachedTokenCount>();
  private readonly selectionState: TokenSelectionState;

  constructor(private fileSnapshotService: FileSnapshotService) {
    this.selectionState = new TokenSelectionState(
      async (filePath) => this.resolveTokenCountForFile(filePath),
      () => this.notifyTokenUpdate()
    );
  }

  getCurrentTokenCount(): number {
    return this.getFileTokenCount() + this.githubIssueTokens;
  }

  getFileTokenCount(): number {
    return this.selectionState.getSnapshot().selectedTokenTotal;
  }

  getGitHubIssueTokenCount(): number {
    return this.githubIssueTokens;
  }

  getIsCounting(): boolean {
    const snapshot = this.selectionState.getSnapshot();
    return snapshot.isCounting || this.isCountingGitHubIssues;
  }

  setGitHubIssueTokens(count: number, isCounting: boolean = false): void {
    this.githubIssueTokens = count;
    this.isCountingGitHubIssues = isCounting;
    this.notifyTokenUpdate();
  }

  applySelectionDelta(addedPaths: string[], removedPaths: string[]): void {
    this.selectionState.applySelectionDelta(addedPaths, removedPaths);
  }

  replaceSelection(filePaths: string[]): void {
    this.selectionState.replaceSelection(filePaths);
  }

  clearSelection(): void {
    this.selectionState.clearSelection();
  }

  invalidateFile(filePath: string): void {
    this.tokenCache.delete(filePath);
    this.selectionState.invalidatePath(filePath);
  }

  getCachedFileTokenCount(
    filePath: string,
    sizeBytes?: number,
    mtimeMs?: number
  ): number | undefined {
    const cachedValue = this.tokenCache.get(filePath);
    if (!cachedValue) {
      return undefined;
    }

    if (sizeBytes !== undefined && cachedValue.size !== sizeBytes) {
      return undefined;
    }

    if (mtimeMs !== undefined && cachedValue.mtimeMs !== mtimeMs) {
      return undefined;
    }

    return cachedValue.tokenCount;
  }

  async waitForIdle(): Promise<void> {
    await this.selectionState.waitForIdle();
  }

  async countTokensForFiles(filePaths: string[]): Promise<number> {
    let totalTokens = 0;

    for (const filePath of filePaths) {
      try {
        totalTokens += (await this.resolveTokenCountForFile(filePath)).tokenCount;
      } catch (error) {
        console.warn(`Error counting tokens for file ${filePath}:`, error);
      }
    }

    return totalTokens;
  }

  countTokensForText(text: string): number {
    try {
      return countTextTokens(text);
    } catch (error) {
      console.error("Error counting tokens for text:", error);
      return 0;
    }
  }

  resetTokenCount(): void {
    this.clearSelection();
    this.githubIssueTokens = 0;
    this.isCountingGitHubIssues = false;
    this.notifyTokenUpdate();
  }

  private async resolveTokenCountForFile(filePath: string): Promise<{
    tokenCount: number;
    cacheable: boolean;
  }> {
    try {
      const snapshot = await this.fileSnapshotService.getSnapshot(filePath);
      if (!snapshot) {
        this.tokenCache.delete(filePath);
        this.selectionState.forgetTokenCount(filePath);
        return { tokenCount: 0, cacheable: false };
      }

      const cachedValue = this.tokenCache.get(filePath);
      if (
        cachedValue &&
        cachedValue.mtimeMs === snapshot.mtimeMs &&
        cachedValue.size === snapshot.size
      ) {
        this.selectionState.rememberTokenCount(filePath, cachedValue.tokenCount);
        this._onDidResolveFileTokens.fire({
          filePath,
          tokenCount: cachedValue.tokenCount,
        });
        return { tokenCount: cachedValue.tokenCount, cacheable: true };
      }

      const tokenCount = countTextTokens(snapshot.content);
      this.tokenCache.set(filePath, {
        mtimeMs: snapshot.mtimeMs,
        size: snapshot.size,
        tokenCount,
      });
      this.selectionState.rememberTokenCount(filePath, tokenCount);
      this._onDidResolveFileTokens.fire({ filePath, tokenCount });
      return { tokenCount, cacheable: true };
    } catch (error) {
      this.tokenCache.delete(filePath);
      this.selectionState.forgetTokenCount(filePath);
      this.handleTokenCountingError(error, filePath);
      return { tokenCount: 0, cacheable: false };
    }
  }

  private notifyTokenUpdate(): void {
    const snapshot = this.selectionState.getSnapshot();
    const payload: TokenUpdatePayload = {
      count: snapshot.selectedTokenTotal + this.githubIssueTokens,
      isCounting: snapshot.isCounting || this.isCountingGitHubIssues,
      fileTokens: snapshot.selectedTokenTotal,
      issueTokens: this.githubIssueTokens,
    };

    this._onDidChangeTokens.fire(payload);
  }

  private handleTokenCountingError(err: unknown, filePath: string): void {
    if (isErrnoException(err) && err.code === "ENOENT") {
      console.warn(`File not found during token count: ${filePath}`);
    } else if (err instanceof Error && err.message?.includes("is too large")) {
      console.warn(`Skipping large file during token count: ${filePath}`);
    } else {
      console.error(`Error processing file for token count ${filePath}:`, err);
    }
  }

  dispose(): void {
    this.tokenCache.clear();
    this._onDidChangeTokens.dispose();
    this._onDidResolveFileTokens.dispose();
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

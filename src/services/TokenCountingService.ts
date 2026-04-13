import * as fs from "fs";
import * as vscode from "vscode";
import { encode } from "gpt-tokenizer";
import { FileNode, FileNodeUtils } from "../models/FileNode";
import { TokenUpdatePayload } from "../models/Events";

/**
 * Service for counting tokens in files with async/cancellation support
 */
export class TokenCountingService {
  private _onDidChangeTokens = new vscode.EventEmitter<TokenUpdatePayload>();
  readonly onDidChangeTokens = this._onDidChangeTokens.event;

  private static readonly TOKEN_COUNT_BATCH_SIZE = 32;

  private totalFileTokens: number = 0;
  private githubIssueTokens: number = 0;
  private isCountingTokens: boolean = false;
  private isCountingGitHubIssues: boolean = false;
  private currentCalculationVersion = 0;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private tokenCache = new Map<
    string,
    { mtimeMs: number; size: number; tokenCount: number }
  >();

  constructor() {}

  /**
   * Get current token count
   */
  getCurrentTokenCount(): number {
    return this.totalFileTokens + this.githubIssueTokens;
  }
  
  /**
   * Get file token count only
   */
  getFileTokenCount(): number {
    return this.totalFileTokens;
  }
  
  /**
   * Get GitHub issue token count only
   */
  getGitHubIssueTokenCount(): number {
    return this.githubIssueTokens;
  }
  
  /**
   * Check if currently counting tokens
   */
  getIsCounting(): boolean {
    return this.isCountingTokens || this.isCountingGitHubIssues;
  }
  
  /**
   * Update GitHub issue token count
   */
  setGitHubIssueTokens(count: number, isCounting: boolean = false): void {
    this.githubIssueTokens = count;
    this.isCountingGitHubIssues = isCounting;
    this.notifyTokenUpdate();
  }
  
  /**
   * Count tokens for an array of file nodes (debounced)
   */
  debouncedUpdateTokenCount(fileNodes: FileNode[], delay: number = 300): void {
    // Clear existing timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
    
    // Invalidate any ongoing calculation
    this.currentCalculationVersion++;
    
    // Set new timeout
    this.debounceTimeout = setTimeout(() => {
      this.updateTokenCount(fileNodes);
    }, delay);
  }
  
  /**
   * Count tokens for an array of file nodes
   */
  async updateTokenCount(fileNodes: FileNode[]): Promise<void> {
    const calculationVersion = this.currentCalculationVersion;
    const checkedFiles = FileNodeUtils.getCheckedFiles(fileNodes);

    if (checkedFiles.length === 0) {
      if (calculationVersion !== this.currentCalculationVersion) {
        return;
      }
      
      this.totalFileTokens = 0;
      this.isCountingTokens = false;
      this.notifyTokenUpdate();
      console.log(`Token count reset to 0 (Version ${calculationVersion} - no files selected).`);
      return;
    }
    
    // Start counting
    console.log(`Token counting started (Version ${calculationVersion}) for ${checkedFiles.length} files.`);
    this.isCountingTokens = true;
    this.notifyTokenUpdate();
    
    let runningTokenCount = 0;

    try {
      this.pruneTokenCache(new Set(checkedFiles.map((fileNode) => fileNode.absolutePath)));

      for (
        let offset = 0;
        offset < checkedFiles.length;
        offset += TokenCountingService.TOKEN_COUNT_BATCH_SIZE
      ) {
        if (calculationVersion !== this.currentCalculationVersion) {
          console.log(`Token counting cancelled (Version ${calculationVersion}). Newer version exists.`);
          return;
        }

        const batch = checkedFiles.slice(
          offset,
          offset + TokenCountingService.TOKEN_COUNT_BATCH_SIZE
        );
        const tokenCounts = await Promise.all(
          batch.map((fileNode) => this.getTokenCountForFile(fileNode.absolutePath))
        );

        runningTokenCount += tokenCounts.reduce((sum, tokenCount) => sum + tokenCount, 0);
        await new Promise((resolve) => setImmediate(resolve));
      }

      if (calculationVersion !== this.currentCalculationVersion) {
        console.log(`Token counting cancelled before final update (Version ${calculationVersion}).`);
        return;
      }
      
      // Update final state
      this.totalFileTokens = runningTokenCount;
      this.isCountingTokens = false;
      console.log(`Token counting finished (Version ${calculationVersion}). Total tokens: ${this.totalFileTokens}`);
      
    } catch (error) {
      console.error("Unexpected error during token counting process:", error);
      
      if (calculationVersion === this.currentCalculationVersion) {
        this.isCountingTokens = false;
        // Keep previous count on error
      }
    } finally {
      // Notify UI only if this calculation is still the latest
      if (calculationVersion === this.currentCalculationVersion) {
        this.isCountingTokens = false;
        this.notifyTokenUpdate();
      }
    }
  }
  
  /**
   * Count tokens for a specific set of file paths (synchronous for small sets)
   */
  async countTokensForFiles(filePaths: string[]): Promise<number> {
    let totalTokens = 0;

    for (const filePath of filePaths) {
      try {
        totalTokens += await this.getTokenCountForFile(filePath);
      } catch (error) {
        console.warn(`Error counting tokens for file ${filePath}:`, error);
      }
    }
    
    return totalTokens;
  }
  
  /**
   * Count tokens for a text string
   */
  countTokensForText(text: string): number {
    try {
      const tokens = encode(text);
      return tokens.length;
    } catch (error) {
      console.error("Error counting tokens for text:", error);
      return 0;
    }
  }
  
  /**
   * Reset token count to zero
   */
  resetTokenCount(): void {
    this.currentCalculationVersion++;
    this.totalFileTokens = 0;
    this.githubIssueTokens = 0;
    this.isCountingTokens = false;
    this.isCountingGitHubIssues = false;
    this.notifyTokenUpdate();
    console.log("Token count reset to 0.");
  }

  private async getTokenCountForFile(filePath: string): Promise<number> {
    try {
      const fileStat = await fs.promises.stat(filePath);
      if (!fileStat.isFile()) {
        return 0;
      }

      const cachedValue = this.tokenCache.get(filePath);
      if (
        cachedValue &&
        cachedValue.mtimeMs === fileStat.mtimeMs &&
        cachedValue.size === fileStat.size
      ) {
        return cachedValue.tokenCount;
      }

      const content = await fs.promises.readFile(filePath, "utf-8");
      const tokenCount = encode(content).length;
      this.tokenCache.set(filePath, {
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
        tokenCount,
      });
      return tokenCount;
    } catch (error) {
      this.tokenCache.delete(filePath);
      this.handleTokenCountingError(error, filePath);
      return 0;
    }
  }

  private pruneTokenCache(selectedPaths: Set<string>): void {
    for (const cachedPath of this.tokenCache.keys()) {
      if (!selectedPaths.has(cachedPath)) {
        this.tokenCache.delete(cachedPath);
      }
    }
  }
  
  /**
   * Handle token counting errors for individual files
   */
  private handleTokenCountingError(err: any, filePath: string): void {
    if (err.code === "ENOENT") {
      console.warn(`File not found during token count: ${filePath}`);
    } else if (err instanceof Error && err.message?.includes("is too large")) {
      console.warn(`Skipping large file during token count: ${filePath}`);
    } else {
      console.error(`Error processing file for token count ${filePath}:`, err);
    }
  }
  
  /**
   * Notify listeners of token count changes
   */
  private notifyTokenUpdate(): void {
    const payload: TokenUpdatePayload = {
      count: this.totalFileTokens + this.githubIssueTokens,
      isCounting: this.isCountingTokens || this.isCountingGitHubIssues,
      fileTokens: this.totalFileTokens,
      issueTokens: this.githubIssueTokens
    };
    
    this._onDidChangeTokens.fire(payload);
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    
    this.currentCalculationVersion++;
    this.tokenCache.clear();
    this._onDidChangeTokens.dispose();
  }
}

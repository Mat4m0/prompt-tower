export interface TokenSelectionSnapshot {
  selectedTokenTotal: number;
  pendingTokenCount: number;
  isCounting: boolean;
  selectedPathCount: number;
}

type StateListener = (snapshot: TokenSelectionSnapshot) => void;

export interface TokenResolution {
  tokenCount: number;
  cacheable: boolean;
}

export class TokenSelectionState {
  private static readonly TOKEN_COUNT_BATCH_SIZE = 32;

  private selectedPaths = new Set<string>();
  private accountedPaths = new Set<string>();
  private pendingPaths = new Set<string>();
  private knownTokenCounts = new Map<string, number>();
  private selectedTokenTotal = 0;
  private processingPromise: Promise<void> | null = null;

  constructor(
  private readonly resolveTokenCount: (
    filePath: string
  ) => Promise<TokenResolution>,
    private readonly onStateChange?: StateListener
  ) {}

  applySelectionDelta(addedPaths: string[], removedPaths: string[]): void {
    let didChange = false;

    for (const filePath of removedPaths) {
      if (!this.selectedPaths.delete(filePath)) {
        continue;
      }

      if (this.accountedPaths.delete(filePath)) {
        this.selectedTokenTotal -= this.knownTokenCounts.get(filePath) ?? 0;
      }

      this.pendingPaths.delete(filePath);
      didChange = true;
    }

    for (const filePath of addedPaths) {
      if (this.selectedPaths.has(filePath)) {
        continue;
      }

      this.selectedPaths.add(filePath);
      const knownTokenCount = this.knownTokenCounts.get(filePath);

      if (knownTokenCount === undefined) {
        this.pendingPaths.add(filePath);
      } else {
        this.accountedPaths.add(filePath);
        this.selectedTokenTotal += knownTokenCount;
      }

      didChange = true;
    }

    if (!didChange) {
      return;
    }

    this.notifyStateChange();
    this.ensureProcessing();
  }

  replaceSelection(filePaths: string[]): void {
    const nextSelection = new Set(filePaths);
    const addedPaths: string[] = [];
    const removedPaths: string[] = [];

    for (const filePath of this.selectedPaths) {
      if (!nextSelection.has(filePath)) {
        removedPaths.push(filePath);
      }
    }

    for (const filePath of nextSelection) {
      if (!this.selectedPaths.has(filePath)) {
        addedPaths.push(filePath);
      }
    }

    this.applySelectionDelta(addedPaths, removedPaths);
  }

  clearSelection(): void {
    if (
      this.selectedPaths.size === 0 &&
      this.accountedPaths.size === 0 &&
      this.pendingPaths.size === 0 &&
      this.selectedTokenTotal === 0
    ) {
      return;
    }

    this.selectedPaths.clear();
    this.accountedPaths.clear();
    this.pendingPaths.clear();
    this.selectedTokenTotal = 0;
    this.notifyStateChange();
  }

  rememberTokenCount(filePath: string, tokenCount: number): void {
    this.knownTokenCounts.set(filePath, tokenCount);
  }

  forgetTokenCount(filePath: string): void {
    this.knownTokenCounts.delete(filePath);
  }

  invalidatePath(filePath: string): void {
    const knownTokenCount = this.knownTokenCounts.get(filePath);
    this.knownTokenCounts.delete(filePath);

    if (!this.selectedPaths.has(filePath)) {
      this.pendingPaths.delete(filePath);
      return;
    }

    let didChange = false;
    if (this.accountedPaths.delete(filePath)) {
      this.selectedTokenTotal -= knownTokenCount ?? 0;
      this.pendingPaths.add(filePath);
      didChange = true;
    } else if (!this.pendingPaths.has(filePath)) {
      this.pendingPaths.add(filePath);
      didChange = true;
    }

    if (!didChange) {
      return;
    }

    this.notifyStateChange();
    this.ensureProcessing();
  }

  getSnapshot(): TokenSelectionSnapshot {
    return {
      selectedTokenTotal: this.selectedTokenTotal,
      pendingTokenCount: this.pendingPaths.size,
      isCounting: this.pendingPaths.size > 0 || this.processingPromise !== null,
      selectedPathCount: this.selectedPaths.size,
    };
  }

  async waitForIdle(): Promise<void> {
    while (this.processingPromise) {
      await this.processingPromise;
    }
  }

  private ensureProcessing(): void {
    if (this.processingPromise || this.pendingPaths.size === 0) {
      return;
    }

    this.processingPromise = this.processPendingPaths();
  }

  private async processPendingPaths(): Promise<void> {
    try {
      while (this.pendingPaths.size > 0) {
        const batch = Array.from(this.pendingPaths).slice(
          0,
          TokenSelectionState.TOKEN_COUNT_BATCH_SIZE
        );
        const results = await Promise.all(
          batch.map(async (filePath) => ({
            filePath,
            resolution: await this.resolveTokenCount(filePath),
          }))
        );

        let didChange = false;

        for (const result of results) {
          if (result.resolution.cacheable) {
            this.knownTokenCounts.set(
              result.filePath,
              result.resolution.tokenCount
            );
          } else {
            this.knownTokenCounts.delete(result.filePath);
          }

          if (!this.pendingPaths.delete(result.filePath)) {
            continue;
          }

          if (
            this.selectedPaths.has(result.filePath) &&
            !this.accountedPaths.has(result.filePath)
          ) {
            this.accountedPaths.add(result.filePath);
            this.selectedTokenTotal += result.resolution.tokenCount;
            didChange = true;
          }
        }

        if (didChange || this.pendingPaths.size === 0) {
          this.notifyStateChange();
        }

        await new Promise((resolve) => setImmediate(resolve));
      }
    } finally {
      this.processingPromise = null;
      this.notifyStateChange();

      if (this.pendingPaths.size > 0) {
        this.ensureProcessing();
      }
    }
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.getSnapshot());
  }
}

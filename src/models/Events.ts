/**
 * Token counting update payload
 */
export interface TokenUpdatePayload {
  /** Total token count */
  count: number;
  
  /** Whether token counting is currently in progress */
  isCounting: boolean;
  
  /** File token count (excluding GitHub issues) */
  fileTokens?: number;
  
  /** GitHub issues token count */
  issueTokens?: number;

  /** Selected token profile id */
  profileId?: string;

  /** Human-readable token profile label */
  profileLabel?: string;

  /** Whether the displayed count is an estimate */
  estimated?: boolean;

  /** Formatted input cost estimate */
  cost?: string;

  /** Input price in USD per million tokens */
  inputPricePerMTok?: number;
  
  /** Error message if token counting failed */
  error?: string;
}

/**
 * File selection change event
 */
export interface FileSelectionChangeEvent {
  /** The file node that changed */
  node: import('./FileNode').FileNode;
  
  /** New checked state */
  isChecked: boolean;

  /** Concrete file paths newly selected by this change */
  addedFilePaths: string[];

  /** Concrete file paths deselected by this change */
  removedFilePaths: string[];
}

/**
 * Workspace change event
 */
export interface WorkspaceChangeEvent {
  /** Type of change */
  type: 'added' | 'removed' | 'modified';
  
  /** The workspace that changed */
  workspace: import('./Workspace').Workspace;
}

/**
 * Ignore pattern change event
 */
export interface IgnorePatternChangeEvent {
  /** Workspace whose ignore sources changed */
  workspace: import("./Workspace").Workspace;
}

/**
 * Tree sync state payload
 */
export interface TreeSyncStatePayload {
  /** Current sync state */
  state: "idle" | "dirty" | "refreshing";

  /** Timestamp of the last completed refresh */
  lastRefreshAt?: number;
}

/**
 * Context generation event
 */
export interface ContextGenerationEvent {
  /** Generated context string */
  context: string;
  
  /** Number of files included */
  fileCount: number;
  
  /** Token count of generated context */
  tokenCount: number;
  
  /** Whether context was copied to clipboard */
  copiedToClipboard: boolean;
}

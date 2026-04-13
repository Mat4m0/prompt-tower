import type * as vscode from "vscode";
import type {
  GitHubComment,
  GitHubIssue,
  GitHubPullRequest,
} from "../api/GitHubApiClient";

export interface GitHubIssueDetails {
  issue: GitHubIssue;
  comments: GitHubComment[];
}

export interface GitHubPullRequestDetails {
  pr: GitHubPullRequest;
  diff: string;
}

export interface GitHubSelectionTokenStatus {
  totalTokens: number;
  selectedCount: number;
  isCounting: boolean;
}

export interface GitHubSelectionProvider {
  readonly onDidChangeTokens: vscode.Event<GitHubSelectionTokenStatus>;
  clearAllSelections(): void;
  getSelectedCount(): number;
}

export interface GitHubIssueContextSource {
  getSelectedIssueDetails(): Promise<Map<number, GitHubIssueDetails>>;
}

export interface GitHubPullRequestContextSource {
  getSelectedPRDetails(): Promise<Map<number, GitHubPullRequestDetails>>;
}

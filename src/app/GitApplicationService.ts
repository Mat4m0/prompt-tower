import type { GitCommit, GitCommitDiff, GitCommitHost } from '../core/git/GitTypes'
import { GitSelection } from '../core/git/GitSelection'
import type { WorkspaceProvider } from './ports'

const DEFAULT_COMMIT_LIMIT = 50

export class GitApplicationService {
  constructor(
    private gitHost: GitCommitHost,
    private workspace: WorkspaceProvider,
    private selection: GitSelection,
  ) {}

  async refreshCommits(limit: number = DEFAULT_COMMIT_LIMIT): Promise<readonly GitCommit[]> {
    const commits = await this.gitHost.listRecentCommits(this.workspace.getWorkspaces(), limit)
    this.selection.setCommits(commits)
    return commits
  }

  async readSelectedDiffs(): Promise<GitCommitDiff[]> {
    const selected = this.selection.getSnapshot().selectedCommits
    return Promise.all(selected.map((commit) => this.gitHost.readCommitDiff(commit)))
  }
}

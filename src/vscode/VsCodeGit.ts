import { execFile } from 'child_process'
import type { GitCommit, GitCommitDiff, GitCommitHost, GitWorkspace } from '../core/git/GitTypes'
import type { FileIndexLogger } from '../core/files/FileIndex'

const FIELD_SEPARATOR = '\x1f'
const MAX_BUFFER = 20 * 1024 * 1024

export class VsCodeGit implements GitCommitHost {
  constructor(private logger?: FileIndexLogger) {}

  async listRecentCommits(
    workspaces: readonly GitWorkspace[],
    limit: number,
  ): Promise<GitCommit[]> {
    const results = await Promise.all(
      workspaces.map(async (workspace) => this.listWorkspaceCommits(workspace, limit)),
    )
    return results.flat()
  }

  async readCommitDiff(commit: GitCommit): Promise<GitCommitDiff> {
    const patch = await runGit(commit.rootPath, [
      'show',
      '--no-ext-diff',
      '--no-color',
      '--find-renames',
      '--format=',
      '--patch',
      commit.hash,
    ])

    return {
      commit,
      patch: stripBinaryPatchNoise(patch),
    }
  }

  private async listWorkspaceCommits(workspace: GitWorkspace, limit: number): Promise<GitCommit[]> {
    try {
      const output = await runGit(workspace.rootPath, [
        'log',
        `--max-count=${limit}`,
        `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s`,
      ])
      return output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => parseCommitLine(line, workspace))
        .filter((commit): commit is GitCommit => commit !== null)
    } catch (error) {
      this.logger?.info(`[git] no commits for ${workspace.name}: ${String(error)}`)
      return []
    }
  }
}

function parseCommitLine(line: string, workspace: GitWorkspace): GitCommit | null {
  const [hash, shortHash, authorName, authorDate, subject] = line.split(FIELD_SEPARATOR)
  if (!hash || !shortHash) {
    return null
  }

  return {
    id: `${workspace.id}:${hash}`,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    rootPath: workspace.rootPath,
    hash,
    shortHash,
    authorName: authorName ?? '',
    authorDate: authorDate ?? '',
    subject: subject ?? '',
  }
}

function runGit(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...args], { maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

function stripBinaryPatchNoise(patch: string): string {
  return patch
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('GIT binary patch'))
    .join('\n')
}

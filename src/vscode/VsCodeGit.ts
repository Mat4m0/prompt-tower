import { execFile } from 'child_process'
import type { GitCommit, GitCommitDiff, GitCommitHost, GitWorkspace } from '../core/git/GitTypes'
import type { FileIndexLogger } from '../core/files/FileIndex'

const FIELD_SEPARATOR = '\x1f'
const MAX_BUFFER = 20 * 1024 * 1024
const MAX_CONTEXT_DIFF_CHARS = 1_000_000

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
    try {
      const rawPatch = await runGit(commit.rootPath, [
        'show',
        '--no-ext-diff',
        '--no-color',
        '--find-renames',
        '--format=',
        '--patch',
        commit.hash,
      ])
      const stripped = stripBinaryPatchNoise(rawPatch)
      const limited = limitPatch(stripped.patch)

      return {
        commit,
        patch: limited.patch,
        warnings: [...stripped.warnings, ...limited.warnings],
      }
    } catch (error) {
      return {
        commit,
        patch: '',
        warnings: [`Could not read commit diff: ${formatErrorMessage(error)}`],
      }
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
      this.logger?.info(`[git] ${describeCommitListFailure(workspace.name, error)}`)
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

function stripBinaryPatchNoise(patch: string): { patch: string; warnings: string[] } {
  let strippedBinaryPatch = false
  const lines = patch.split(/\r?\n/).filter((line) => {
    const binaryPatchLine =
      line.startsWith('GIT binary patch') || /^Binary files .+ differ$/.test(line)
    strippedBinaryPatch ||= binaryPatchLine
    return !binaryPatchLine
  })
  return {
    patch: lines.join('\n'),
    warnings: strippedBinaryPatch ? ['Binary patch content was omitted from the context.'] : [],
  }
}

function limitPatch(patch: string): { patch: string; warnings: string[] } {
  if (patch.length <= MAX_CONTEXT_DIFF_CHARS) {
    return { patch, warnings: [] }
  }
  return {
    patch: `${patch.slice(0, MAX_CONTEXT_DIFF_CHARS)}\n[diff truncated at ${MAX_CONTEXT_DIFF_CHARS} characters]`,
    warnings: [`Diff was truncated at ${MAX_CONTEXT_DIFF_CHARS} characters.`],
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function describeCommitListFailure(workspaceName: string, error: unknown): string {
  const message = formatErrorMessage(error)
  if (/not a git repository/i.test(message)) {
    return `workspace ${workspaceName} is not a Git repository; commit selection is unavailable`
  }
  if (/does not have any commits yet|unknown revision|ambiguous argument 'HEAD'/i.test(message)) {
    return `workspace ${workspaceName} has no commits; commit selection is unavailable`
  }
  return `could not list commits for ${workspaceName}: ${message}`
}

import * as path from 'path'
import * as vscode from 'vscode'
import ignore from 'ignore'
import type { FileIndexHost, FileStat, IndexedWorkspace } from '../core/files/FileIndex'
import { ALWAYS_IGNORE } from '../utils/alwaysIgnore'
import { normalizeIgnorePath } from '../core/files/IgnoreRules'
import type { FileIndexLogger } from '../core/files/FileIndex'

export class VsCodeFileSystem implements FileIndexHost {
  constructor(private logger?: FileIndexLogger) {}

  async listFiles(workspace: IndexedWorkspace): Promise<string[]> {
    const matcher = await this.createMatcher(workspace)
    const exclude = buildFindFilesExcludePattern()
    const startedAt = Date.now()
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspace.rootPath, '**/*'),
      exclude,
      undefined,
    )
    this.logger?.info(
      `[fs] findFiles returned ${uris.length} uri(s) for ${workspace.name} in ${Date.now() - startedAt}ms`,
    )
    return uris
      .map((uri) => uri.fsPath)
      .filter((absolutePath) => {
        const relativePath = normalizeIgnorePath(path.relative(workspace.rootPath, absolutePath))
        return !matcher.ignores(relativePath)
      })
  }

  async statFile(absolutePath: string): Promise<FileStat | null> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath))
      if (stat.type !== vscode.FileType.File) {
        return null
      }
      return {
        sizeBytes: stat.size,
        mtimeMs: stat.mtime,
      }
    } catch {
      return null
    }
  }

  async readText(absolutePath: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath))
    return Buffer.from(bytes).toString('utf8')
  }

  async writeText(absolutePath: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(absolutePath)
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(absolutePath)))
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'))
  }

  private async createMatcher(workspace: IndexedWorkspace): Promise<ignore.Ignore> {
    const matcher = ignore()
    matcher.add(ALWAYS_IGNORE)

    if (vscode.workspace.getConfiguration('promptLupinum').get<boolean>('useGitignore', true)) {
      matcher.add(await this.readIgnoreFile(path.join(workspace.rootPath, '.gitignore')))
    }
    matcher.add(await this.readIgnoreFile(path.join(workspace.rootPath, '.contextignore')))
    matcher.add(await this.readIgnoreFile(path.join(workspace.rootPath, '.towerignore')))
    return matcher
  }

  private async readIgnoreFile(filePath: string): Promise<string[]> {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))
      const content = Buffer.from(bytes).toString('utf8')
      return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
    } catch {
      return []
    }
  }
}

function buildFindFilesExcludePattern(): string {
  const patterns = ALWAYS_IGNORE.flatMap((pattern) => toFindFilesExclude(pattern))
  return `{${[...new Set(patterns)].join(',')}}`
}

function toFindFilesExclude(pattern: string): string[] {
  const normalized = pattern.replace(/\\/g, '/')
  if (!normalized || normalized.includes('*.')) {
    return []
  }
  if (normalized.startsWith('**/') && normalized.endsWith('/**')) {
    return [normalized]
  }
  if (normalized.endsWith('/')) {
    const directory = normalized.replace(/\/+$/, '')
    return [directory, `**/${directory}/**`]
  }
  if (normalized.startsWith('.')) {
    return [normalized, `**/${normalized}`]
  }
  return []
}

import path from 'path'
import type {
  ContextBuildRequest,
  ContextBuildResult,
  ContextFile,
  ContextWarning,
} from './ContextFormat'
import { formatCompactGitDiffs, formatReadableGitDiffs } from '../git/GitDiffFormatter'

export function assembleContext(request: ContextBuildRequest): ContextBuildResult {
  const warnings: ContextWarning[] = []
  const fileBlocks: string[] = []

  for (const file of request.files) {
    const snapshot = request.snapshots.get(file.id)
    if (!snapshot) {
      warnings.push({
        type: 'missingFile',
        fileId: file.id,
        path: file.relativePath,
      })
      continue
    }

    fileBlocks.push(
      request.outputMode === 'compact'
        ? formatCompactFileBlock(file, snapshot.content)
        : formatReadableFileBlock(file, snapshot.content),
    )
  }

  const contextBody =
    request.outputMode === 'compact'
      ? assembleCompactBody(request, fileBlocks)
      : assembleReadableBody(request, fileBlocks)
  const text = addPrefixAndSuffix(contextBody, request.prefix, request.suffix ?? '')

  return {
    text,
    fileCount: fileBlocks.length,
    commitCount: request.gitDiffs?.length ?? 0,
    characterCount: text.length,
    warnings,
  }
}

function assembleReadableBody(request: ContextBuildRequest, fileBlocks: readonly string[]): string {
  const treeBlock = shouldIncludeTree(request)
    ? `<project_tree>\n${escapeText(request.projectTree)}\n</project_tree>\n`
    : ''
  const filesBlock =
    fileBlocks.length > 0 ? `<project_files>\n${fileBlocks.join('\n')}\n</project_files>\n` : ''
  const gitBlock = formatReadableGitDiffs(request.gitDiffs ?? [])

  if (!treeBlock && !filesBlock && !gitBlock) {
    return ''
  }

  return `<context>\n${treeBlock}${filesBlock}${gitBlock}</context>`
}

function assembleCompactBody(request: ContextBuildRequest, fileBlocks: readonly string[]): string {
  const treeBlock = shouldIncludeTree(request)
    ? `<project_tree>${escapeText(trimGeneratedSection(request.projectTree))}</project_tree>`
    : ''
  const filesBlock =
    fileBlocks.length > 0 ? `<project_files>${fileBlocks.join('')}</project_files>` : ''
  const gitBlock = formatCompactGitDiffs(request.gitDiffs ?? [])

  return treeBlock || filesBlock || gitBlock
    ? `<context>${treeBlock}${filesBlock}${gitBlock}</context>`
    : ''
}

function formatReadableFileBlock(file: ContextFile, content: string): string {
  const sourcePath = toSourcePath(file.relativePath)
  const fileName = file.name || path.basename(file.relativePath)
  return `<file name="${escapeAttribute(fileName)}" path="${escapeAttribute(
    sourcePath,
  )}">\n${escapeText(content)}</file>`
}

function formatCompactFileBlock(file: ContextFile, content: string): string {
  return `<file path="${escapeAttribute(toSourcePath(file.relativePath))}">${escapeText(
    content,
  )}</file>`
}

function shouldIncludeTree(request: ContextBuildRequest): boolean {
  return request.treeMode !== 'none' && request.projectTree.length > 0
}

function addPrefixAndSuffix(content: string, prefix: string, suffix: string): string {
  let result = content

  if (prefix) {
    result = result ? `${prefix}\n${result}` : prefix
  }

  if (suffix) {
    result = result ? `${result}\n${suffix}` : suffix
  }

  return result
}

function toSourcePath(relativePath: string): string {
  return '/' + relativePath.replace(/\\/g, '/')
}

function trimGeneratedSection(content: string): string {
  return content.trim().replace(/\n{3,}/g, '\n\n')
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

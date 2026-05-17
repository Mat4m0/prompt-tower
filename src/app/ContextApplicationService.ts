import { assembleContext } from '../core/context/ContextAssembler'
import { estimateContextCharacters } from '../core/context/ContextEstimate'
import type {
  ContextFile,
  ContextFileSnapshot,
  ContextGitDiff,
  ContextWarning,
  ContextOutputMode,
  ProjectTreeMode,
} from '../core/context/ContextFormat'
import { generateFileStructureTree } from '../core/context/ProjectTreeBuilder'
import { estimateGitDiffChars } from '../core/git/GitDiffFormatter'
import type { GitCommitDiff } from '../core/git/GitTypes'
import type { FileIndex, IndexedNode } from '../core/files/FileIndex'
import type { FileSelection } from '../core/files/FileSelection'
import {
  estimateTokenCountFromBytes,
  estimateTokenCountFromTextLength,
  formatTokenCost,
  type TokenEstimateProfile,
} from '../core/tokens/TokenEstimateProfiles'
import { buildPromptExportTarget } from '../core/export/PromptFileWriter'
import type { PromptExportOptions } from '../core/export/ExportOptions'

export interface TextFileSystem {
  readText(absolutePath: string): Promise<string>
  writeText(absolutePath: string, content: string): PromiseLike<void>
}

export type WriteClipboardText = (text: string) => PromiseLike<void>
export type ReadSelectedGitDiffs = () => Promise<readonly GitCommitDiff[]>

export interface ContextBuildOptions {
  prefix: string
  treeMode: ProjectTreeMode
  outputMode: ContextOutputMode
}

export interface ContextBuildOutput {
  text: string
  fileCount: number
  commitCount: number
  estimatedTokenCount: number
  estimatedCost: string
  warnings: readonly ContextWarning[]
}

export class ContextApplicationService {
  constructor(
    private fileIndex: FileIndex,
    private fileSelection: FileSelection,
    private fileSystem: TextFileSystem,
    private writeClipboardText: WriteClipboardText,
    private tokenProfile: TokenEstimateProfile,
    private readSelectedGitDiffs?: ReadSelectedGitDiffs,
  ) {}

  setTokenEstimateProfile(profile: TokenEstimateProfile): void {
    this.tokenProfile = profile
    this.fileIndex.setTokenEstimateProfile(profile)
  }

  async buildContext(options: ContextBuildOptions): Promise<ContextBuildOutput> {
    await this.fileIndex.ensureFresh()
    this.fileSelection.reconcile(this.fileIndex.getSnapshot())
    const selection = this.fileSelection.getSnapshot()
    const files = selection.selectedFiles.map(
      (file): ContextFile => ({
        id: file.id,
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        name: file.name,
      }),
    )
    const snapshots = await this.loadSnapshots(files)
    const projectTree = this.buildProjectTree(options.treeMode)
    const gitDiffs = await this.loadGitDiffs()
    const result = assembleContext({
      files,
      snapshots,
      prefix: options.prefix,
      projectTree,
      treeMode: options.treeMode,
      outputMode: options.outputMode,
      gitDiffs,
    })
    const estimatedTokenCount = estimateTokenCountFromTextLength(result.text, this.tokenProfile)
    return {
      text: result.text,
      fileCount: result.fileCount,
      commitCount: result.commitCount,
      estimatedTokenCount,
      estimatedCost: formatTokenCost(estimatedTokenCount, this.tokenProfile),
      warnings: result.warnings,
    }
  }

  async copyContext(options: ContextBuildOptions): Promise<ContextBuildOutput> {
    const output = await this.buildContext(options)
    await this.writeClipboardText(output.text)
    return output
  }

  async saveContext(
    workspaceRoot: string,
    exportOptions: PromptExportOptions,
    buildOptions: ContextBuildOptions,
  ): Promise<{ output: ContextBuildOutput; filePath: string; fileName: string }> {
    const output = await this.buildContext(buildOptions)
    const target = buildPromptExportTarget(workspaceRoot, exportOptions, new Date())
    await this.fileSystem.writeText(target.absolutePath, output.text)
    return {
      output,
      filePath: target.absolutePath,
      fileName: target.fileName,
    }
  }

  async estimatePreviewForProfiles(
    options: ContextBuildOptions,
    profiles: readonly TokenEstimateProfile[],
  ): Promise<Array<{ profile: TokenEstimateProfile; tokens: number; cost: string }>> {
    const selection = this.fileSelection.getSnapshot()
    const fixedChars = await this.estimatePreviewFixedCharacters(options)
    return profiles.map((profile) => {
      const fileTokens = selection.selectedFiles.reduce(
        (sum, file) =>
          sum +
          estimateTokenCountFromBytes(fileSizeChars(file), profile, file.name) +
          Math.ceil(
            estimateFileBlockOverheadChars(file, options.outputMode) / profile.charsPerToken,
          ),
        0,
      )
      const tokens = Math.ceil(fixedChars / profile.charsPerToken) + fileTokens
      return {
        profile,
        tokens,
        cost: formatTokenCost(tokens, profile),
      }
    })
  }

  private async estimatePreviewFixedCharacters(options: ContextBuildOptions): Promise<number> {
    const selection = this.fileSelection.getSnapshot()
    const projectTree = this.buildProjectTree(options.treeMode)
    const selectedFileBlockOverheadChars = selection.selectedFiles.reduce(
      (sum, file) => sum + estimateFileBlockOverheadChars(file, options.outputMode),
      0,
    )
    const selectedGitDiffChars = await this.estimateGitDiffCharacters(options.outputMode)
    return estimateContextCharacters({
      prefix: options.prefix,
      suffix: '',
      selectedFileBlockChars: selectedFileBlockOverheadChars,
      selectedFileCount: selection.selectedFiles.length,
      selectedGitDiffChars,
      projectTree,
      treeType: options.treeMode,
      minify: options.outputMode === 'compact',
    })
  }

  private async loadGitDiffs(): Promise<ContextGitDiff[]> {
    const diffs = await this.readSelectedGitDiffs?.()
    return (diffs ?? []).map(toContextGitDiff)
  }

  private async estimateGitDiffCharacters(outputMode: ContextOutputMode): Promise<number> {
    const diffs = await this.loadGitDiffs()
    return estimateGitDiffChars(diffs, outputMode === 'compact')
  }

  private async loadSnapshots(
    files: readonly ContextFile[],
  ): Promise<Map<string, ContextFileSnapshot>> {
    const snapshots = new Map<string, ContextFileSnapshot>()
    await Promise.all(
      files.map(async (file) => {
        try {
          snapshots.set(file.id, {
            content: await this.fileSystem.readText(file.absolutePath),
          })
        } catch {
          // Missing snapshots are converted to user-visible context warnings by the assembler.
        }
      }),
    )
    return snapshots
  }

  private buildProjectTree(treeMode: ProjectTreeMode): string {
    if (treeMode === 'none') {
      return ''
    }

    const snapshot = this.fileIndex.getSnapshot()
    const selection = this.fileSelection.getSnapshot()
    const entries =
      treeMode === 'selectedFilesOnly'
        ? selection.selectedFiles
        : treeMode === 'fullDirectoriesOnly'
          ? [...snapshot.nodes.values()].filter((node) => node.kind !== 'file')
          : snapshot.files
    const rootNodes = snapshot.rootIds
      .map((id) => snapshot.nodes.get(id))
      .filter((node): node is IndexedNode => node !== undefined)
    const multiRoot = rootNodes.length > 1
    const workspaceNames = new Map(rootNodes.map((node) => [node.workspaceId, node.name]))
    const primaryRoot = multiRoot ? 'workspace' : (rootNodes[0]?.absolutePath ?? '')
    return generateFileStructureTree(
      primaryRoot,
      entries.map((entry) => ({
        tree: toTreePath(
          entry,
          workspaceNames.get(entry.workspaceId) ?? entry.workspaceId,
          multiRoot,
        ),
      })),
    )
  }
}

function toContextGitDiff(diff: GitCommitDiff): ContextGitDiff {
  return {
    commit: {
      id: diff.commit.id,
      workspaceName: diff.commit.workspaceName,
      hash: diff.commit.hash,
      shortHash: diff.commit.shortHash,
      authorName: diff.commit.authorName,
      authorDate: diff.commit.authorDate,
      subject: diff.commit.subject,
    },
    patch: diff.patch,
  }
}

function toTreePath(entry: IndexedNode, workspaceName: string, multiRoot: boolean): string {
  const relativePath = entry.kind === 'file' ? entry.relativePath : `${entry.relativePath}/`
  return multiRoot ? `${workspaceName}/${relativePath}` : relativePath
}

function estimateFileBlockOverheadChars(file: ContextFile, outputMode: ContextOutputMode): number {
  const sourcePath = `/${file.relativePath.replace(/\\/g, '/')}`
  if (outputMode === 'compact') {
    return `<file path="${sourcePath}"></file>`.length
  }

  return `<file name="${file.name}" path="${sourcePath}">\n\n</file>`.length
}

function fileSizeChars(file: ContextFile): number {
  return 'sizeBytes' in file && typeof file.sizeBytes === 'number' ? file.sizeBytes : 0
}

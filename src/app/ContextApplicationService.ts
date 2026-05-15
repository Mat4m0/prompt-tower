import { assembleContext } from "../core/context/ContextAssembler";
import { estimateContextCharacters } from "../core/context/ContextEstimate";
import type {
  ContextFile,
  ContextFileSnapshot,
  ContextOutputMode,
  ProjectTreeMode,
} from "../core/context/ContextFormat";
import { generateFileStructureTree } from "../core/context/ProjectTreeBuilder";
import type { FileIndex } from "../core/files/FileIndex";
import type { FileSelection } from "../core/files/FileSelection";
import { estimateTokensFromText, formatTokenCost, type TokenProfile } from "../core/tokens/TokenProfiles";
import type { VsCodeClipboard } from "../vscode/VsCodeClipboard";
import type { VsCodeFileSystem } from "../vscode/VsCodeFileSystem";
import { buildPromptExportTarget } from "../core/export/PromptFileWriter";
import type { PromptExportOptions } from "../core/export/ExportOptions";

export interface ContextBuildOptions {
  prefix: string;
  treeMode: ProjectTreeMode;
  outputMode: ContextOutputMode;
}

export interface ContextBuildOutput {
  text: string;
  fileCount: number;
  estimatedTokens: number;
  estimatedCost: string;
}

export class ContextApplicationService {
  constructor(
    private fileIndex: FileIndex,
    private fileSelection: FileSelection,
    private fileSystem: VsCodeFileSystem,
    private clipboard: VsCodeClipboard,
    private tokenProfile: TokenProfile
  ) {}

  setTokenProfile(profile: TokenProfile): void {
    this.tokenProfile = profile;
    this.fileIndex.setTokenProfile(profile);
  }

  async buildContext(options: ContextBuildOptions): Promise<ContextBuildOutput> {
    await this.fileIndex.ensureFresh();
    this.fileSelection.reconcile(this.fileIndex.getSnapshot());
    const snapshot = this.fileIndex.getSnapshot();
    const selection = this.fileSelection.getSnapshot();
    const files = selection.selectedFiles.map((file): ContextFile => ({
      id: file.id,
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      name: file.name,
    }));
    const snapshots = await this.loadSnapshots(files);
    const projectTree = await this.buildProjectTree(options.treeMode);
    const result = assembleContext({
      files,
      snapshots,
      prefix: options.prefix,
      projectTree,
      treeMode: options.treeMode,
      outputMode: options.outputMode,
    });
    const estimatedTokens = estimateTokensFromText(result.text, this.tokenProfile);
    return {
      text: result.text,
      fileCount: result.fileCount,
      estimatedTokens,
      estimatedCost: formatTokenCost(estimatedTokens, this.tokenProfile),
    };
  }

  async copyContext(options: ContextBuildOptions): Promise<ContextBuildOutput> {
    const output = await this.buildContext(options);
    await this.clipboard.writeText(output.text);
    return output;
  }

  async saveContext(
    workspaceRoot: string,
    exportOptions: PromptExportOptions,
    buildOptions: ContextBuildOptions
  ): Promise<{ output: ContextBuildOutput; filePath: string; fileName: string }> {
    const output = await this.buildContext(buildOptions);
    const target = buildPromptExportTarget(workspaceRoot, exportOptions, new Date());
    await this.fileSystem.writeText(target.absolutePath, output.text);
    return {
      output,
      filePath: target.absolutePath,
      fileName: target.fileName,
    };
  }

  estimateCurrentSelection(prefix: string): { tokens: number; cost: string } {
    const chars = this.fileSelection
      .getSnapshot()
      .selectedFiles.reduce((sum, file) => sum + file.sizeBytes, prefix.length);
    const tokens = Math.ceil(chars / this.tokenProfile.charsPerToken);
    return {
      tokens,
      cost: formatTokenCost(tokens, this.tokenProfile),
    };
  }

  async estimatePreview(options: ContextBuildOptions): Promise<{
    tokens: number;
    cost: string;
  }> {
    const selection = this.fileSelection.getSnapshot();
    const projectTree = await this.buildProjectTree(options.treeMode);
    const selectedFileBlockChars = selection.selectedFiles.reduce(
      (sum, file) => sum + estimateFileBlockChars(file, options.outputMode),
      0
    );
    const chars = estimateContextCharacters({
      prefix: options.prefix,
      suffix: "",
      selectedFileBlockChars,
      selectedFileCount: selection.selectedFiles.length,
      projectTree,
      treeType: options.treeMode,
      minify: options.outputMode === "compact",
    });
    const tokens = Math.ceil(chars / this.tokenProfile.charsPerToken);
    return {
      tokens,
      cost: formatTokenCost(tokens, this.tokenProfile),
    };
  }

  private async loadSnapshots(
    files: readonly ContextFile[]
  ): Promise<Map<string, ContextFileSnapshot>> {
    const snapshots = new Map<string, ContextFileSnapshot>();
    await Promise.all(
      files.map(async (file) => {
        snapshots.set(file.id, {
          content: await this.fileSystem.readText(file.absolutePath),
        });
      })
    );
    return snapshots;
  }

  private async buildProjectTree(treeMode: ProjectTreeMode): Promise<string> {
    if (treeMode === "none") {
      return "";
    }

    const snapshot = this.fileIndex.getSnapshot();
    const selection = this.fileSelection.getSnapshot();
    const entries =
      treeMode === "selectedFilesOnly"
        ? selection.selectedFiles
        : treeMode === "fullDirectoriesOnly"
          ? [...snapshot.nodes.values()].filter((node) => node.kind !== "file")
          : snapshot.files;
    const primaryRoot = snapshot.rootIds
      .map((id) => snapshot.nodes.get(id))
      .find(Boolean)?.absolutePath ?? "";
    return generateFileStructureTree(
      primaryRoot,
      entries.map((entry) => ({
        origin: entry.kind === "file" ? entry.absolutePath : `${entry.absolutePath}/`,
        tree: entry.kind === "file" ? entry.relativePath : `${entry.relativePath}/`,
      }))
    );
  }
}

function estimateFileBlockChars(
  file: ContextFile,
  outputMode: ContextOutputMode
): number {
  const sourcePath = `/${file.relativePath.replace(/\\/g, "/")}`;
  if (outputMode === "compact") {
    return `<file path="${sourcePath}"></file>`.length + fileSizeChars(file);
  }

  return (
    `<file name="${file.name}" path="${sourcePath}">\n\n</file>`.length +
    fileSizeChars(file)
  );
}

function fileSizeChars(file: ContextFile): number {
  return "sizeBytes" in file && typeof file.sizeBytes === "number"
    ? file.sizeBytes
    : 0;
}

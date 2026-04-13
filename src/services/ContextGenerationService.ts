import * as vscode from "vscode";
import { FileNode, FileNodeUtils } from "../models/FileNode";
import { ContextConfig } from "../models/Workspace";
import {
  GitHubIssueContextSource,
  GitHubPullRequestContextSource,
} from "../models/GitHubContext";
import { generateFileStructureTree } from "../utils/fileTree";
import {
  applyContextWrapperTemplate,
  formatContextFileContent,
} from "./contextGenerationCore";
import { FileSnapshotService } from "./FileSnapshotService";
import {
  formatGitHubIssueBlock,
  formatGitHubPullRequestBlock,
} from "./githubContextFormatter";

export interface ContextGenerationResult {
  contextString: string;
  fileCount: number;
  tokenCount?: number;
}

interface StructuredFilePath {
  origin: string;
  tree: string;
}

interface OutputFormatSettings {
  blockTemplate?: string;
  blockSeparator?: string;
  blockTrimLines?: boolean;
  projectTreeFormat?: {
    enabled?: boolean;
    type?: ContextConfig["projectTree"]["type"];
    showFileSize?: boolean;
    template?: string;
  };
  wrapperFormat?: {
    template?: string;
  } | null;
}

export class ContextGenerationService {
  private config!: ContextConfig;
  private gitHubIssuesProvider?: GitHubIssueContextSource;
  private gitHubPRsProvider?: GitHubPullRequestContextSource;
  private fileBlockCache = new Map<
    string,
    {
      mtimeMs: number;
      size: number;
      configSignature: string;
      block: string;
    }
  >();

  constructor(private fileSnapshotService: FileSnapshotService) {
    this.loadConfiguration();
    this.setupConfigurationWatcher();
  }

  private loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration("promptTower");
    const outputFormat = config.get<OutputFormatSettings>("outputFormat") ?? {};
    const projectTreeFormat = outputFormat.projectTreeFormat ?? {};
    const wrapperFormat = outputFormat.wrapperFormat;

    this.config = {
      blockTemplate:
        outputFormat.blockTemplate ||
        '<file name="{fileNameWithExtension}" path="{rawFilePath}">\n{fileContent}\n</file>',
      blockSeparator: outputFormat.blockSeparator || "\n",
      blockTrimLines: outputFormat.blockTrimLines ?? true,
      wrapperTemplate:
        wrapperFormat === null
          ? null
          : wrapperFormat?.template ||
            "<context>\n{githubIssues}{githubPRs}{treeBlock}<project_files>\n{blocks}\n</project_files>\n</context>",
      projectTree: {
        enabled: projectTreeFormat.enabled ?? true,
        type: projectTreeFormat.type || "fullFilesAndDirectories",
        showFileSize: projectTreeFormat.showFileSize ?? false,
        template: "<project_tree>\n{projectTree}\n</project_tree>\n",
      },
      promptPrefix: "",
      promptSuffix: "",
      maxFileSizeWarningKB: config.get<number>("maxFileSizeWarningKB", 500),
    };
  }

  private setupConfigurationWatcher(): void {
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("promptTower.outputFormat")) {
        this.loadConfiguration();
        this.fileBlockCache.clear();
      }
    });
  }

  async generateContext(
    fileNodes: FileNode[],
    options?: {
      prefix?: string;
      suffix?: string;
      primaryWorkspaceRoot?: string;
      treeType?: string;
      minify?: boolean;
    }
  ): Promise<ContextGenerationResult> {
    const checkedFiles = FileNodeUtils.getCheckedFiles(fileNodes);
    const fileCount = checkedFiles.length;
    const effectiveTreeType = options?.treeType || this.config.projectTree.type;

    try {
      const githubIssuesPromise = this.generateGitHubIssuesBlocks();
      const githubPRsPromise = this.generateGitHubPRsBlocks();
      const fileBlocksPromise =
        fileCount > 0
          ? Promise.all(
              checkedFiles.map((node) =>
                this.generateFileBlock(node, options?.minify ?? false)
              )
            )
          : Promise.resolve([]);

      const [githubIssuesBlocks, githubPRsBlocks, fileBlocks] = await Promise.all([
        githubIssuesPromise,
        githubPRsPromise,
        fileBlocksPromise,
      ]);

      const hasGitHubBlocks =
        githubIssuesBlocks.length > 0 || githubPRsBlocks.length > 0;

      if (fileCount === 0 && !hasGitHubBlocks) {
        if (
          this.config.projectTree.enabled &&
          (effectiveTreeType === "fullFilesAndDirectories" ||
            effectiveTreeType === "fullDirectoriesOnly")
        ) {
          const fileTree = await this.generateProjectTree(
            fileNodes,
            options?.primaryWorkspaceRoot,
            effectiveTreeType
          );
          return {
            contextString: this.addPrefixAndSuffix(
              this.config.projectTree.template.replace("{projectTree}", fileTree),
              options
            ),
            fileCount: 0,
          };
        }

        return { contextString: "", fileCount: 0 };
      }

      const fileTree = await this.generateProjectTree(
        fileNodes,
        options?.primaryWorkspaceRoot,
        effectiveTreeType
      );
      const joinedFileBlocks = fileBlocks.join(this.config.blockSeparator);
      const joinedGithubIssues = githubIssuesBlocks.join(this.config.blockSeparator);
      const joinedGithubPRs = githubPRsBlocks.join(this.config.blockSeparator);

      return {
        contextString: this.addPrefixAndSuffix(
          this.applyWrapperTemplate(
            joinedFileBlocks,
            joinedGithubIssues,
            joinedGithubPRs,
            fileTree,
            fileCount,
            options?.minify ?? false
          ),
          options
        ),
        fileCount,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Error generating context string: ${errorMessage}`);
    }
  }

  private async generateFileBlock(
    fileNode: FileNode,
    minify: boolean
  ): Promise<string> {
    try {
      const snapshot = await this.fileSnapshotService.getSnapshot(
        fileNode.absolutePath
      );
      if (!snapshot) {
        this.fileBlockCache.delete(fileNode.absolutePath);
        return `<!-- Error reading file: ${fileNode.relativePath} -->`;
      }

      const configSignature = `${this.getFileBlockConfigSignature()}:${minify ? "min" : "full"}`;
      const cachedBlock = this.fileBlockCache.get(fileNode.absolutePath);
      if (
        cachedBlock &&
        cachedBlock.mtimeMs === snapshot.mtimeMs &&
        cachedBlock.size === snapshot.size &&
        cachedBlock.configSignature === configSignature
      ) {
        return cachedBlock.block;
      }

      const block = formatContextFileContent(
        {
          absolutePath: fileNode.absolutePath,
          relativePath: fileNode.relativePath,
        },
        snapshot.content,
        this.config,
        { minify }
      );
      this.fileBlockCache.set(fileNode.absolutePath, {
        mtimeMs: snapshot.mtimeMs,
        size: snapshot.size,
        configSignature,
        block,
      });
      return block;
    } catch (error) {
      console.error(
        `Error generating block for file ${fileNode.absolutePath}:`,
        error
      );
      this.fileBlockCache.delete(fileNode.absolutePath);
      return `<!-- Error reading file: ${fileNode.relativePath} -->`;
    }
  }

  private async generateProjectTree(
    fileNodes: FileNode[],
    primaryWorkspaceRoot?: string,
    treeType?: string
  ): Promise<string> {
    if (!this.config.projectTree.enabled) {
      return "";
    }

    const effectiveTreeType = treeType || this.config.projectTree.type;
    const filesToInclude =
      effectiveTreeType === "selectedFilesOnly"
        ? FileNodeUtils.getCheckedFiles(fileNodes).map((node) => ({
            origin: node.absolutePath,
            tree: node.relativePath,
          }))
        : this.getAllWorkspaceFiles(fileNodes, effectiveTreeType);

    const workspaceRoot =
      primaryWorkspaceRoot || this.determinePrimaryWorkspaceRoot(fileNodes);

    return generateFileStructureTree(workspaceRoot, filesToInclude, undefined, {
      showFileSize:
        effectiveTreeType === "fullDirectoriesOnly"
          ? false
          : this.config.projectTree.showFileSize,
    });
  }

  private getAllWorkspaceFiles(
    fileNodes: FileNode[],
    treeType: string
  ): StructuredFilePath[] {
    const allFiles: StructuredFilePath[] = [];
    const stack = [...fileNodes];

    while (stack.length > 0) {
      const node = stack.pop()!;

      if (node.type === "file" && treeType !== "fullDirectoriesOnly") {
        allFiles.push({
          origin: node.absolutePath,
          tree: node.relativePath,
        });
      } else if (node.type === "directory") {
        allFiles.push({
          origin: `${node.absolutePath}/`,
          tree: `${node.relativePath}/`,
        });
      }

      if (node.children) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }

    return allFiles;
  }

  private determinePrimaryWorkspaceRoot(fileNodes: FileNode[]): string {
    for (const node of fileNodes) {
      if (node.type === "workspace-root") {
        return node.workspace.rootPath;
      }
    }

    return process.cwd();
  }

  private applyWrapperTemplate(
    fileBlocks: string,
    githubIssues: string,
    githubPRs: string,
    projectTree: string,
    fileCount: number,
    minify: boolean
  ): string {
    return applyContextWrapperTemplate({
      config: this.config,
      fileBlocks,
      githubIssues,
      githubPRs,
      projectTree,
      fileCount,
      minify,
    });
  }

  async copyToClipboard(
    fileNodes: FileNode[],
    options?: {
      prefix?: string;
      suffix?: string;
      primaryWorkspaceRoot?: string;
      minify?: boolean;
    }
  ): Promise<ContextGenerationResult> {
    try {
      const result = await this.generateContext(fileNodes, options);

      if (result.fileCount === 0 && !result.contextString) {
        vscode.window.showWarningMessage(
          "No files selected or prefix/suffix entered to copy!"
        );
        return result;
      }

      await vscode.env.clipboard.writeText(result.contextString);
      vscode.window.showInformationMessage(
        `Success: Copied context for ${result.fileCount} files to clipboard.`
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Error copying context to clipboard: ${errorMessage}`
      );
      throw error;
    }
  }

  updateConfig(updates: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...updates };
    this.fileBlockCache.clear();
  }

  getConfig(): ContextConfig {
    return { ...this.config };
  }

  setGitHubIssuesProvider(provider: GitHubIssueContextSource): void {
    this.gitHubIssuesProvider = provider;
  }

  setGitHubPRsProvider(provider: GitHubPullRequestContextSource): void {
    this.gitHubPRsProvider = provider;
  }

  private async generateGitHubIssuesBlocks(): Promise<string[]> {
    if (!this.gitHubIssuesProvider) {
      return [];
    }

    try {
      const selectedIssues =
        await this.gitHubIssuesProvider.getSelectedIssueDetails();

      if (selectedIssues.size === 0) {
        return [];
      }

      return Array.from(selectedIssues.values(), (details) =>
        formatGitHubIssueBlock(details)
      );
    } catch (error) {
      console.error("Error generating GitHub issues blocks:", error);
      return [];
    }
  }

  private async generateGitHubPRsBlocks(): Promise<string[]> {
    if (!this.gitHubPRsProvider) {
      return [];
    }

    try {
      const selectedPRs = await this.gitHubPRsProvider.getSelectedPRDetails();

      if (selectedPRs.size === 0) {
        return [];
      }

      return Array.from(selectedPRs.values(), (details) =>
        formatGitHubPullRequestBlock(details)
      );
    } catch (error) {
      console.error("Error generating GitHub PRs blocks:", error);
      return [];
    }
  }

  private addPrefixAndSuffix(
    content: string,
    options?: {
      prefix?: string;
      suffix?: string;
    }
  ): string {
    let result = content;

    if (options?.prefix) {
      result = `${options.prefix}\n${result}`;
    }
    if (options?.suffix) {
      if (result.length > 0 && !result.endsWith("\n")) {
        result += "\n";
      }
      result += options.suffix;
    }

    return result;
  }

  private getFileBlockConfigSignature(): string {
    return `${this.config.blockTrimLines}:${this.config.blockTemplate}`;
  }
}

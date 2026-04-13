import * as fs from "fs";
import * as vscode from "vscode";
import { FileNode, FileNodeUtils } from "../models/FileNode";
import { ContextConfig } from "../models/Workspace";
import { generateFileStructureTree } from "../utils/fileTree";
import {
  applyContextWrapperTemplate,
  formatContextFileContent,
} from "./contextGenerationCore";

export interface ContextGenerationResult {
  contextString: string;
  fileCount: number;
  tokenCount?: number;
}

interface StructuredFilePath {
  origin: string;
  tree: string;
}

export class ContextGenerationService {
  private config!: ContextConfig;
  private gitHubIssuesProvider?: any;
  private gitHubPRsProvider?: any;
  private fileBlockCache = new Map<
    string,
    {
      mtimeMs: number;
      size: number;
      configSignature: string;
      block: string;
    }
  >();

  constructor() {
    this.loadConfiguration();
    this.setupConfigurationWatcher();
  }

  private loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration("promptTower");
    const outputFormat = config.get<any>("outputFormat") || {};
    const projectTreeFormat =
      config.get<any>("outputFormat.projectTreeFormat") || {};
    const wrapperFormat = config.get<any>("outputFormat.wrapperFormat");

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
          ? Promise.all(checkedFiles.map((node) => this.generateFileBlock(node)))
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
            fileCount
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

  private async generateFileBlock(fileNode: FileNode): Promise<string> {
    try {
      const fileStat = await fs.promises.stat(fileNode.absolutePath);
      if (!fileStat.isFile()) {
        this.fileBlockCache.delete(fileNode.absolutePath);
        return `<!-- Error reading file: ${fileNode.relativePath} -->`;
      }

      const configSignature = this.getFileBlockConfigSignature();
      const cachedBlock = this.fileBlockCache.get(fileNode.absolutePath);
      if (
        cachedBlock &&
        cachedBlock.mtimeMs === fileStat.mtimeMs &&
        cachedBlock.size === fileStat.size &&
        cachedBlock.configSignature === configSignature
      ) {
        return cachedBlock.block;
      }

      const fileContent = await fs.promises.readFile(fileNode.absolutePath, "utf8");
      const block = formatContextFileContent(
        {
          absolutePath: fileNode.absolutePath,
          relativePath: fileNode.relativePath,
        },
        fileContent,
        this.config
      );
      this.fileBlockCache.set(fileNode.absolutePath, {
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
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
    fileCount: number
  ): string {
    return applyContextWrapperTemplate({
      config: this.config,
      fileBlocks,
      githubIssues,
      githubPRs,
      projectTree,
      fileCount,
    });
  }

  async copyToClipboard(
    fileNodes: FileNode[],
    options?: {
      prefix?: string;
      suffix?: string;
      primaryWorkspaceRoot?: string;
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

  setGitHubIssuesProvider(provider: any): void {
    this.gitHubIssuesProvider = provider;
  }

  setGitHubPRsProvider(provider: any): void {
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

      const blocks: string[] = [];

      for (const [, details] of selectedIssues) {
        const { issue, comments } = details;

        let issueBlock = `<github_issue number="${issue.number}" state="${issue.state}">
<title>${issue.title}</title>
<url>${issue.html_url}</url>
<created_at>${issue.created_at}</created_at>
<author>${issue.user.login}</author>`;

        if (issue.labels.length > 0) {
          const labelNames = issue.labels.map((label: any) => label.name).join(", ");
          issueBlock += `\n<labels>${labelNames}</labels>`;
        }

        if (issue.body) {
          issueBlock += `\n<body>\n${issue.body}\n</body>`;
        }

        if (comments.length > 0) {
          issueBlock += "\n<comments>";
          for (const comment of comments) {
            issueBlock += `\n<comment author="${comment.user.login}" created_at="${comment.created_at}">
${comment.body}
</comment>`;
          }
          issueBlock += "\n</comments>";
        }

        issueBlock += "\n</github_issue>";
        blocks.push(issueBlock);
      }

      return blocks;
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

      const blocks: string[] = [];
      for (const [prNumber, details] of selectedPRs) {
        blocks.push(`<github_pr number="${prNumber}">\n${details.diff}\n</github_pr>`);
      }
      return blocks;
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

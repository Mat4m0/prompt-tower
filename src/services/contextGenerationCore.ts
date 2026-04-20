import * as fs from "fs";
import * as path from "path";

export interface ContextFileEntry {
  absolutePath: string;
  relativePath: string;
}

export interface ContextCoreConfig {
  blockTemplate: string;
  blockSeparator: string;
  blockTrimLines: boolean;
  wrapperTemplate: string | null;
  projectTree: {
    type:
      | "fullFilesAndDirectories"
      | "fullDirectoriesOnly"
      | "selectedFilesOnly"
      | "none";
    template: string;
  };
}

export interface WrapperTemplateOptions {
  config: ContextCoreConfig;
  fileBlocks: string;
  githubIssues: string;
  githubPRs: string;
  projectTree: string;
  includeProjectTree: boolean;
  fileCount: number;
  minify?: boolean;
  outputFileName?: string;
  timestamp?: string;
}

export async function formatContextFileBlock(
  fileEntry: ContextFileEntry,
  config: Pick<
    ContextCoreConfig,
    "blockTemplate" | "blockTrimLines"
  >,
  options?: {
    minify?: boolean;
  }
): Promise<string> {
  try {
    const fileContent = await fs.promises.readFile(fileEntry.absolutePath, "utf8");
    return formatContextFileContent(fileEntry, fileContent, config, options);
  } catch (error) {
    console.error(
      `Error generating block for file ${fileEntry.absolutePath}:`,
      error
    );
    return `<!-- Error reading file: ${fileEntry.relativePath} -->`;
  }
}

export function formatContextFileContent(
  fileEntry: ContextFileEntry,
  fileContent: string,
  config: Pick<
    ContextCoreConfig,
    "blockTemplate" | "blockTrimLines"
  >,
  options?: {
    minify?: boolean;
  }
): string {
  const fileNameWithExtension = path.basename(fileEntry.absolutePath);
  const fileExtension = path.extname(fileEntry.absolutePath);
  const fileName = path.basename(fileEntry.absolutePath, fileExtension);
  const sourcePath = "/" + fileEntry.relativePath.replace(/\\/g, "/");

  let formattedBlock = config.blockTemplate;
  formattedBlock = formattedBlock.replace(
    /{fileNameWithExtension}/g,
    fileNameWithExtension
  );
  formattedBlock = formattedBlock.replace(/{rawFilePath}/g, sourcePath);
  formattedBlock = formattedBlock.replace(/{fileName}/g, fileName);
  formattedBlock = formattedBlock.replace(/{fileExtension}/g, fileExtension);
  formattedBlock = formattedBlock.replace(/{fullPath}/g, fileEntry.absolutePath);

  let trimmedFileContent = fileContent;
  if (config.blockTrimLines) {
    trimmedFileContent = trimmedFileContent.replace(/^(\s*\r?\n)+/, "");
    trimmedFileContent = trimmedFileContent.replace(/(\r?\n\s*)+$/, "");
  }

  if (options?.minify) {
    return `<file path="${sourcePath}">${trimmedFileContent}</file>`;
  }

  return formattedBlock.replace(/{fileContent}/g, trimmedFileContent);
}

export function applyContextWrapperTemplate(
  options: WrapperTemplateOptions
): string {
  const {
    config,
    fileBlocks,
    githubIssues,
    githubPRs,
    projectTree,
    includeProjectTree,
    fileCount,
    minify = false,
    outputFileName = "clipboard-content",
    timestamp = new Date().toISOString(),
  } = options;

  if (minify) {
    return applyMinifiedContextWrapper({
      fileBlocks,
      githubIssues,
      githubPRs,
      projectTree,
      includeProjectTree,
    });
  }

  if (!config.wrapperTemplate) {
    const parts = [githubIssues, githubPRs, fileBlocks].filter((part) => part);
    return parts.join(config.blockSeparator);
  }

  const treeBlock = includeProjectTree
    ? config.projectTree.template.replace("{projectTree}", projectTree)
    : "";
  const githubIssuesSection = githubIssues ? `${githubIssues}\n` : "";
  const githubPRsSection = githubPRs ? `${githubPRs}\n` : "";

  return config.wrapperTemplate
    .replace(/{treeBlock}/g, treeBlock)
    .replace(/{githubIssues}/g, githubIssuesSection)
    .replace(/{githubPRs}/g, githubPRsSection)
    .replace(/{blocks}/g, fileBlocks)
    .replace(/{timestamp}/g, timestamp)
    .replace(/{fileCount}/g, String(fileCount))
    .replace(/{outputFileName}/g, outputFileName);
}

function applyMinifiedContextWrapper(options: {
  fileBlocks: string;
  githubIssues: string;
  githubPRs: string;
  projectTree: string;
  includeProjectTree: boolean;
}): string {
  const sections = [
    wrapMinifiedSection("github_issues", options.githubIssues),
    wrapMinifiedSection("github_prs", options.githubPRs),
    options.includeProjectTree
      ? wrapMinifiedSection("project_tree", options.projectTree)
      : "",
    wrapMinifiedSection("project_files", options.fileBlocks),
  ].filter((section) => section.length > 0);

  if (sections.length === 0) {
    return "";
  }

  return `<context>${sections.join("")}</context>`;
}

function wrapMinifiedSection(tagName: string, content: string): string {
  if (!content) {
    return "";
  }

  return `<${tagName}>${trimGeneratedSection(content)}</${tagName}>`;
}

function trimGeneratedSection(content: string): string {
  return content.trim().replace(/\n{3,}/g, "\n\n");
}

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
    enabled: boolean;
    template: string;
  };
}

export interface WrapperTemplateOptions {
  config: ContextCoreConfig;
  fileBlocks: string;
  githubIssues: string;
  githubPRs: string;
  projectTree: string;
  fileCount: number;
  outputFileName?: string;
  timestamp?: string;
}

export async function formatContextFileBlock(
  fileEntry: ContextFileEntry,
  config: Pick<
    ContextCoreConfig,
    "blockTemplate" | "blockTrimLines"
  >
): Promise<string> {
  try {
    const fileContent = await fs.promises.readFile(fileEntry.absolutePath, "utf8");
    return formatContextFileContent(fileEntry, fileContent, config);
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
  >
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
    fileCount,
    outputFileName = "clipboard-content",
    timestamp = new Date().toISOString(),
  } = options;

  if (!config.wrapperTemplate) {
    const parts = [githubIssues, githubPRs, fileBlocks].filter((part) => part);
    return parts.join(config.blockSeparator);
  }

  const treeBlock = config.projectTree.enabled
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

import * as path from "path";
import {
  normalizeCustomFolderPath,
  normalizePromptExportOptions,
  type PromptExportCustomPathMode,
  type PromptExportLocation,
  type PromptExportOptions,
} from "./ExportOptions";

export interface PromptExportTarget {
  directoryPath: string;
  absolutePath: string;
  fileName: string;
}

export function createWrapperTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export function buildPromptExportTarget(
  workspaceRoot: string,
  options: PromptExportOptions,
  date: Date = new Date()
): PromptExportTarget {
  const normalized = normalizePromptExportOptions(options);
  const fileName = buildPromptExportFileName(normalized, date);
  const directoryPath = resolvePromptExportDirectoryPath(
    workspaceRoot,
    normalized.location,
    normalized.customFolderPath,
    normalized.customFolderPathMode
  );

  return {
    directoryPath,
    absolutePath: path.join(directoryPath, fileName),
    fileName,
  };
}

export function buildPromptExportFileName(
  options: PromptExportOptions,
  date: Date
): string {
  const timestamp = options.includeTimestamp
    ? `-${formatPromptExportTimestamp(date)}`
    : "";
  return `${options.fileName}${timestamp}.${options.format}`;
}

export function resolvePromptExportDirectoryPath(
  workspaceRoot: string,
  location: PromptExportLocation,
  customFolderPath: string,
  customFolderPathMode: PromptExportCustomPathMode
): string {
  if (location === "workspaceRoot") {
    return workspaceRoot;
  }

  if (location === "customFolder") {
    return resolveCustomDirectoryPath(
      workspaceRoot,
      customFolderPath,
      customFolderPathMode
    );
  }

  return path.join(workspaceRoot, ".prompt-lupinum", "prompts");
}

export function resolveCustomDirectoryPath(
  workspaceRoot: string,
  customFolderPath: string,
  customFolderPathMode: PromptExportCustomPathMode
): string {
  const normalizedPath = normalizeCustomFolderPath(
    customFolderPath,
    customFolderPathMode
  );
  if (!normalizedPath) {
    throw new Error("Custom folder path cannot be empty.");
  }

  if (customFolderPathMode === "absolute") {
    if (!path.isAbsolute(normalizedPath)) {
      throw new Error("Absolute custom folder path must be absolute.");
    }

    return path.resolve(normalizedPath);
  }

  const resolvedPath = path.resolve(workspaceRoot, normalizedPath);
  const relativeToRoot = path.relative(workspaceRoot, resolvedPath);
  const escapesWorkspace =
    relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot);

  if (escapesWorkspace) {
    throw new Error("Custom folder must stay inside the workspace root.");
  }

  return resolvedPath;
}

export function formatPromptExportTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

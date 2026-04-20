import * as path from "path";
import * as vscode from "vscode";

export type PromptExportFormat = "md" | "txt";
export type PromptExportCustomPathMode = "relative" | "absolute";
export type PromptExportLocation =
  | "prompttower"
  | "workspaceRoot"
  | "customFolder";

export interface PromptExportOptions {
  fileName: string;
  format: PromptExportFormat;
  location: PromptExportLocation;
  customFolderPath: string;
  customFolderPathMode: PromptExportCustomPathMode;
  includeTimestamp: boolean;
}

export interface SavedPromptFile {
  uri: vscode.Uri;
  absolutePath: string;
  fileName: string;
}

const STORAGE_KEY = "promptTower.promptExportOptions";

const DEFAULT_EXPORT_OPTIONS: PromptExportOptions = {
  fileName: "prompt",
  format: "md",
  location: "prompttower",
  customFolderPath: "prompts",
  customFolderPathMode: "relative",
  includeTimestamp: true,
};

export class PromptExportService {
  constructor(private context: vscode.ExtensionContext) {}

  getOptions(): PromptExportOptions {
    const stored =
      this.context.workspaceState.get<Partial<PromptExportOptions>>(STORAGE_KEY) ??
      {};

    return {
      fileName: this.sanitizeInputFileName(stored.fileName),
      format: this.normalizeFormat(stored.format),
      location: this.normalizeLocation(stored.location),
      customFolderPathMode: this.normalizeCustomFolderPathMode(
        stored.customFolderPathMode
      ),
      customFolderPath: this.normalizeCustomFolderPath(
        stored.customFolderPath,
        this.normalizeCustomFolderPathMode(stored.customFolderPathMode)
      ),
      includeTimestamp: stored.includeTimestamp ?? DEFAULT_EXPORT_OPTIONS.includeTimestamp,
    };
  }

  async saveOptions(options: Partial<PromptExportOptions>): Promise<PromptExportOptions> {
    const merged = {
      ...this.getOptions(),
      ...options,
    };
    const normalized = this.normalizeOptions(merged);
    await this.context.workspaceState.update(STORAGE_KEY, normalized);
    return normalized;
  }

  async writePromptFile(
    workspaceRoot: string,
    content: string,
    options: PromptExportOptions,
    date: Date = new Date()
  ): Promise<SavedPromptFile> {
    const normalized = this.normalizeOptions(options);
    const fileName = this.buildFileName(normalized, date);
    const directoryPath = this.resolveDirectoryPath(
      workspaceRoot,
      normalized.location,
      normalized.customFolderPath,
      normalized.customFolderPathMode
    );
    const uri = vscode.Uri.file(path.join(directoryPath, fileName));

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(directoryPath));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));

    return {
      uri,
      absolutePath: uri.fsPath,
      fileName,
    };
  }

  createWrapperTimestamp(date: Date = new Date()): string {
    return date.toISOString();
  }

  private normalizeOptions(options: PromptExportOptions): PromptExportOptions {
    return {
      fileName: this.sanitizeInputFileName(options.fileName),
      format: this.normalizeFormat(options.format),
      location: this.normalizeLocation(options.location),
      customFolderPathMode: this.normalizeCustomFolderPathMode(
        options.customFolderPathMode
      ),
      customFolderPath: this.normalizeCustomFolderPath(
        options.customFolderPath,
        this.normalizeCustomFolderPathMode(options.customFolderPathMode)
      ),
      includeTimestamp: options.includeTimestamp,
    };
  }

  private sanitizeInputFileName(fileName: string | undefined): string {
    const fallback = DEFAULT_EXPORT_OPTIONS.fileName;
    if (!fileName) {
      return fallback;
    }

    const trimmed = fileName.trim();
    if (!trimmed) {
      return fallback;
    }

    const withoutExtension = trimmed.replace(/\.(md|txt)$/i, "");
    const sanitized = withoutExtension
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "");

    return sanitized || fallback;
  }

  private normalizeFormat(format: PromptExportFormat | string | undefined): PromptExportFormat {
    return format === "txt" ? "txt" : DEFAULT_EXPORT_OPTIONS.format;
  }

  private normalizeLocation(
    location: PromptExportLocation | string | undefined
  ): PromptExportLocation {
    if (location === "workspaceRoot" || location === "customFolder") {
      return location;
    }

    return DEFAULT_EXPORT_OPTIONS.location;
  }

  private normalizeCustomFolderPathMode(
    mode: PromptExportCustomPathMode | string | undefined
  ): PromptExportCustomPathMode {
    return mode === "absolute" ? "absolute" : "relative";
  }

  private normalizeCustomFolderPath(
    customFolderPath: string | undefined,
    mode: PromptExportCustomPathMode
  ): string {
    const fallback =
      mode === "relative" ? DEFAULT_EXPORT_OPTIONS.customFolderPath : "";
    if (!customFolderPath) {
      return fallback;
    }

    const trimmed = customFolderPath.trim();
    if (!trimmed) {
      return fallback;
    }

    if (mode === "absolute") {
      return path.normalize(trimmed);
    }

    const normalized = trimmed
      .replace(/\\/g, "/")
      .replace(/^\.\/+/, "")
      .replace(/^\/+/, "")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "");

    return normalized || fallback;
  }

  private buildFileName(options: PromptExportOptions, date: Date): string {
    const timestamp = options.includeTimestamp
      ? `-${this.formatFileNameTimestamp(date)}`
      : "";
    return `${options.fileName}${timestamp}.${options.format}`;
  }

  private resolveDirectoryPath(
    workspaceRoot: string,
    location: PromptExportLocation,
    customFolderPath: string,
    customFolderPathMode: PromptExportCustomPathMode
  ): string {
    if (location === "workspaceRoot") {
      return workspaceRoot;
    }

    if (location === "customFolder") {
      return this.resolveCustomDirectoryPath(
        workspaceRoot,
        customFolderPath,
        customFolderPathMode
      );
    }

    return path.join(workspaceRoot, ".prompttower", "prompts");
  }

  private resolveCustomDirectoryPath(
    workspaceRoot: string,
    customFolderPath: string,
    customFolderPathMode: PromptExportCustomPathMode
  ): string {
    const normalizedPath = this.normalizeCustomFolderPath(
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

  private formatFileNameTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  }
}

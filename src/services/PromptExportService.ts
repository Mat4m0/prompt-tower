import * as path from "path";
import * as vscode from "vscode";

export type PromptExportFormat = "md" | "txt";
export type PromptExportLocation = "prompttower" | "workspaceRoot";

export interface PromptExportOptions {
  fileName: string;
  format: PromptExportFormat;
  location: PromptExportLocation;
  includeTimestamp: boolean;
}

export interface SavedPromptFile {
  uri: vscode.Uri;
  absolutePath: string;
  fileName: string;
  directoryPath: string;
}

const STORAGE_KEY = "promptTower.promptExportOptions";

const DEFAULT_EXPORT_OPTIONS: PromptExportOptions = {
  fileName: "prompt",
  format: "md",
  location: "prompttower",
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
    options: PromptExportOptions
  ): Promise<SavedPromptFile> {
    const normalized = this.normalizeOptions(options);
    const timestamp = new Date();
    const fileName = this.buildFileName(normalized, timestamp);
    const directoryPath = this.resolveDirectoryPath(workspaceRoot, normalized.location);
    const uri = vscode.Uri.file(path.join(directoryPath, fileName));

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(directoryPath));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));

    return {
      uri,
      absolutePath: uri.fsPath,
      fileName,
      directoryPath,
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
    return location === "workspaceRoot"
      ? "workspaceRoot"
      : DEFAULT_EXPORT_OPTIONS.location;
  }

  private buildFileName(options: PromptExportOptions, date: Date): string {
    const timestamp = options.includeTimestamp
      ? `-${this.formatFileNameTimestamp(date)}`
      : "";
    return `${options.fileName}${timestamp}.${options.format}`;
  }

  private resolveDirectoryPath(
    workspaceRoot: string,
    location: PromptExportLocation
  ): string {
    if (location === "workspaceRoot") {
      return workspaceRoot;
    }

    return path.join(workspaceRoot, ".prompttower", "prompts");
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

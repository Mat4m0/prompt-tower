export type ProjectTreeMode =
  | "fullFilesAndDirectories"
  | "fullDirectoriesOnly"
  | "selectedFilesOnly"
  | "none";

export type ContextOutputMode = "readable" | "compact";

export interface ContextFile {
  id: string;
  absolutePath: string;
  relativePath: string;
  name: string;
}

export interface ContextFileSnapshot {
  content: string;
}

export interface ContextWarning {
  type: "missingFile";
  fileId: string;
  path: string;
}

export interface ContextBuildRequest {
  files: readonly ContextFile[];
  snapshots: ReadonlyMap<string, ContextFileSnapshot>;
  prefix: string;
  suffix?: string;
  projectTree: string;
  treeMode: ProjectTreeMode;
  outputMode: ContextOutputMode;
}

export interface ContextBuildResult {
  text: string;
  fileCount: number;
  characterCount: number;
  warnings: readonly ContextWarning[];
}

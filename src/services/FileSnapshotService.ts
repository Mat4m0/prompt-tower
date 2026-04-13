import * as fs from "fs";

export interface FileSnapshot {
  absolutePath: string;
  content: string;
  mtimeMs: number;
  size: number;
}

export class FileSnapshotService {
  private snapshotCache = new Map<string, FileSnapshot>();

  async getSnapshot(filePath: string): Promise<FileSnapshot | null> {
    try {
      const fileStat = await fs.promises.stat(filePath);
      if (!fileStat.isFile()) {
        this.snapshotCache.delete(filePath);
        return null;
      }

      const cachedSnapshot = this.snapshotCache.get(filePath);
      if (
        cachedSnapshot &&
        cachedSnapshot.mtimeMs === fileStat.mtimeMs &&
        cachedSnapshot.size === fileStat.size
      ) {
        return cachedSnapshot;
      }

      const content = await fs.promises.readFile(filePath, "utf8");
      const snapshot: FileSnapshot = {
        absolutePath: filePath,
        content,
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
      };
      this.snapshotCache.set(filePath, snapshot);
      return snapshot;
    } catch {
      this.snapshotCache.delete(filePath);
      return null;
    }
  }

  async getSnapshots(filePaths: string[]): Promise<Map<string, FileSnapshot>> {
    const snapshots = await Promise.all(
      filePaths.map(async (filePath) => [filePath, await this.getSnapshot(filePath)] as const)
    );

    return new Map(
      snapshots.filter((entry): entry is readonly [string, FileSnapshot] => entry[1] !== null)
    );
  }

  clear(): void {
    this.snapshotCache.clear();
  }
}

import path from "node:path";
import type { DownloadCheckpoint } from "../checkpoint";
import { checkpointPathFor, readJsonFile, removeFile, writeJsonFile } from "../disk";

/** Disk-backed checkpoint.json next to job work files. */
export class CheckpointStore {
  constructor(private readonly jobDir: string) {}

  path(): string {
    return checkpointPathFor(this.jobDir);
  }

  async load(): Promise<DownloadCheckpoint | null> {
    return readJsonFile<DownloadCheckpoint>(this.path());
  }

  async save(cp: DownloadCheckpoint): Promise<void> {
    await writeJsonFile(this.path(), { ...cp, updatedAt: Date.now() });
  }

  async clear(): Promise<void> {
    await removeFile(this.path());
  }

  static forDest(destPath: string): CheckpointStore {
    return new CheckpointStore(path.dirname(destPath));
  }
}

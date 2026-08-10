import path from "node:path";
import type { DownloadCheckpoint } from "../../jobs/checkpoint";
import { FilesystemStorage, checkpointPathFor } from "../../storage/filesystem";

const storage = new FilesystemStorage();

/** Disk-backed checkpoint.json next to job work files. */
export class CheckpointStore {
  constructor(private readonly jobDir: string) {}

  path(): string {
    return checkpointPathFor(this.jobDir);
  }

  async load(): Promise<DownloadCheckpoint | null> {
    return storage.readJson<DownloadCheckpoint>(this.path());
  }

  async save(cp: DownloadCheckpoint): Promise<void> {
    await storage.writeJson(this.path(), { ...cp, updatedAt: Date.now() });
  }

  async clear(): Promise<void> {
    await storage.remove(this.path());
  }

  static forDest(destPath: string): CheckpointStore {
    return new CheckpointStore(path.dirname(destPath));
  }
}

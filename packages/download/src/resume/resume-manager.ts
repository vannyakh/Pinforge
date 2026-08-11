import type { DownloadCheckpoint, SegmentCheckpoint } from "../checkpoint";
import { CheckpointStore } from "./checkpoint-store";
import { recoverCheckpoint, type RecoveryResult } from "./recovery";
import { validateCheckpoint } from "./validator";

/** Optional bridge so download never imports JobManager / engine. */
export interface ResumeJobBridge {
  saveCheckpoint(cp: DownloadCheckpoint): Promise<void>;
  updateProgress(
    jobId: string,
    progress: { downloadedBytes?: number; totalBytes?: number }
  ): Promise<unknown>;
  deleteCheckpoint(jobId: string): Promise<void>;
}

export interface ResumeManagerOptions {
  jobs?: ResumeJobBridge;
}

/**
 * Coordinates checkpoint persistence across HTTP / HLS / DASH strategies.
 */
export class ResumeManager {
  private readonly jobs?: ResumeJobBridge;

  constructor(opts: ResumeManagerOptions = {}) {
    this.jobs = opts.jobs;
  }

  async loadDisk(jobDir: string): Promise<DownloadCheckpoint | null> {
    return new CheckpointStore(jobDir).load();
  }

  async save(jobDir: string, cp: DownloadCheckpoint): Promise<void> {
    const next = { ...cp, updatedAt: Date.now() };
    await new CheckpointStore(jobDir).save(next);
    if (this.jobs) {
      await this.jobs.saveCheckpoint(next);
      await this.jobs
        .updateProgress(cp.jobId, {
          downloadedBytes: cp.downloadedBytes,
          totalBytes: cp.totalBytes,
        })
        .catch(() => undefined);
    }
  }

  async clear(jobDir: string, jobId?: string): Promise<void> {
    await new CheckpointStore(jobDir).clear();
    if (this.jobs && jobId) {
      await this.jobs.deleteCheckpoint(jobId).catch(() => undefined);
    }
  }

  async recover(
    jobDir: string,
    live: {
      url: string;
      etag?: string | null;
      lastModified?: string | null;
      contentLength?: number | null;
      formatId?: string;
    }
  ): Promise<RecoveryResult> {
    return recoverCheckpoint(jobDir, live);
  }

  validate(
    checkpoint: DownloadCheckpoint,
    live: {
      url: string;
      etag?: string | null;
      lastModified?: string | null;
      contentLength?: number | null;
      formatId?: string;
    }
  ) {
    return validateCheckpoint(checkpoint, live);
  }

  withSegments(cp: DownloadCheckpoint, segments: SegmentCheckpoint[]): DownloadCheckpoint {
    const downloadedBytes = segments
      .filter((s) => s.downloaded)
      .reduce((n, s) => n + (s.size ?? 0), 0);
    return {
      ...cp,
      segments,
      downloadedBytes,
      updatedAt: Date.now(),
    };
  }
}

export { validateCheckpoint } from "./validator";
export { recoverCheckpoint } from "./recovery";
export type { RecoveryResult } from "./recovery";
export { CheckpointStore } from "./checkpoint-store";

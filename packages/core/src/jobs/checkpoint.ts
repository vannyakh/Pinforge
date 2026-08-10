/** Persistent download checkpoints (HTTP / HLS / DASH). */

export type CheckpointType = "http" | "hls" | "dash";

export interface SegmentCheckpoint {
  index: number;
  url: string;
  downloaded: boolean;
  size?: number;
  checksum?: string;
  path?: string;
}

export interface DownloadCheckpoint {
  jobId: string;
  url: string;
  provider?: string;
  formatId?: string;
  type: CheckpointType;
  downloadedBytes: number;
  totalBytes?: number;
  etag?: string;
  lastModified?: string;
  contentLength?: number;
  checksum?: string;
  /** Absolute or job-relative path to .part file */
  partPath?: string;
  finalPath?: string;
  /** Completed byte ranges for multi-fragment HTTP. */
  completedRanges?: Array<{ start: number; end: number }>;
  segments?: SegmentCheckpoint[];
  updatedAt: number;
}

export interface CheckpointValidationInput {
  url: string;
  etag?: string | null;
  lastModified?: string | null;
  contentLength?: number | null;
  formatId?: string;
}

export type CheckpointValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

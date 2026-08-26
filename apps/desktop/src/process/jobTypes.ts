/**
 * Job shapes mirrored from pinforge-server (camelCase JSON).
 * Desktop no longer depends on Node MediaCore for execution.
 */

export type JobStatus =
  | "queued"
  | "analyzing"
  | "downloading"
  | "paused"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface DownloadJob {
  id: string;
  url: string;
  status: JobStatus;
  provider?: string;
  progress: {
    downloadedBytes: number;
    totalBytes?: number;
    percent?: number;
  };
  files: {
    temp?: string;
    final?: string;
    jobDir?: string;
  };
  outputDir?: string;
  title?: string;
  error?: string;
  packId?: string;
  createdAt: number;
  updatedAt: number;
}

export function jobStatusToPackStatus(
  status: JobStatus
): "running" | "partial" | "done" | "failed" {
  switch (status) {
    case "completed":
      return "done";
    case "failed":
      return "failed";
    case "paused":
    case "cancelled":
      return "partial";
    default:
      return "running";
  }
}

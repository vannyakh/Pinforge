/** MediaCore download job types. */

export type JobStatus =
  | "queued"
  | "analyzing"
  | "downloading"
  | "paused"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
}

export interface JobFiles {
  temp?: string;
  final?: string;
  jobDir?: string;
}

export interface JobFormat {
  video?: string;
  audio?: string;
  container?: string;
  formatId?: string;
}

export interface DownloadJob {
  id: string;
  url: string;
  status: JobStatus;
  provider?: string;
  format?: JobFormat;
  progress: JobProgress;
  files: JobFiles;
  outputDir?: string;
  title?: string;
  error?: string;
  /** Link to legacy desktop DownloadPack id when dual-writing. */
  packId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateJobInput {
  url: string;
  outputDir?: string;
  provider?: string;
  title?: string;
  format?: JobFormat;
  packId?: string;
}

export interface ListJobsFilter {
  status?: JobStatus[];
  limit?: number;
}

export interface CancelJobOptions {
  /** When true, delete temp/part/segment files. Default false (keep). */
  deleteFiles?: boolean;
}

export function createJobId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `job_${t}${r}`;
}

export function progressPercent(p: JobProgress): number | undefined {
  if (typeof p.percent === "number") return p.percent;
  if (p.totalBytes && p.totalBytes > 0) {
    return Math.round((p.downloadedBytes / p.totalBytes) * 10000) / 100;
  }
  return undefined;
}

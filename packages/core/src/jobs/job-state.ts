import type { DownloadJob, JobStatus } from "./job";

const ACTIVE: ReadonlySet<JobStatus> = new Set([
  "queued",
  "analyzing",
  "downloading",
  "processing",
]);

const UNFINISHED: ReadonlySet<JobStatus> = new Set([
  "queued",
  "analyzing",
  "downloading",
  "paused",
  "processing",
]);

const TERMINAL: ReadonlySet<JobStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export function isActiveStatus(status: JobStatus): boolean {
  return ACTIVE.has(status);
}

export function isUnfinishedStatus(status: JobStatus): boolean {
  return UNFINISHED.has(status);
}

export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL.has(status);
}

/** Statuses that were in-flight when the process died — eligible for recover. */
export function isRecoverableCrashStatus(status: JobStatus): boolean {
  return status === "analyzing" || status === "downloading" || status === "processing";
}

export function canPause(job: DownloadJob): boolean {
  return job.status === "downloading" || job.status === "analyzing" || job.status === "processing";
}

export function canResume(job: DownloadJob): boolean {
  return job.status === "paused" || job.status === "queued" || job.status === "failed";
}

export function canCancel(job: DownloadJob): boolean {
  return !isTerminalStatus(job.status);
}

/** Map MediaCore job status → legacy PackStatus for dual-write UI. */
export function jobStatusToPackStatus(
  status: JobStatus
): "running" | "done" | "failed" | "partial" {
  switch (status) {
    case "completed":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
    case "paused":
      return "partial";
    default:
      return "running";
  }
}

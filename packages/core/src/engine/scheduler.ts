import type { JobManager } from "../jobs/job-manager";
import type { DownloadJob, JobStatus } from "../jobs/job";
import { isTerminalStatus } from "../jobs/job-state";

/**
 * Lightweight in-process queue for job waiters / future multi-worker.
 */
export class JobScheduler {
  private readonly waiters = new Map<
    string,
    { resolve: (job: DownloadJob) => void; reject: (err: Error) => void }[]
  >();
  private readonly running = new Set<string>();

  constructor(private readonly jobs: JobManager) {
    this.jobs.on((ev) => {
      if (ev.type !== "updated") return;
      if (!isTerminalStatus(ev.job.status)) return;
      this.complete(ev.job.id, ev.job);
    });
  }

  enqueue(jobId: string): void {
    this.running.add(jobId);
  }

  complete(jobId: string, job?: DownloadJob): void {
    this.running.delete(jobId);
    const list = this.waiters.get(jobId);
    if (!list?.length) return;
    if (job) {
      for (const w of list) w.resolve(job);
    }
    this.waiters.delete(jobId);
  }

  isRunning(jobId: string): boolean {
    return this.running.has(jobId);
  }

  async wait(jobId: string): Promise<DownloadJob> {
    const current = await this.jobs.get(jobId);
    if (current && isTerminalStatus(current.status)) return current;

    return new Promise<DownloadJob>((resolve, reject) => {
      const list = this.waiters.get(jobId) ?? [];
      list.push({ resolve, reject });
      this.waiters.set(jobId, list);
    });
  }
}

export type TerminalJobStatus = Extract<
  JobStatus,
  "completed" | "failed" | "cancelled"
>;

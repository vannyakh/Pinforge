import fs from "node:fs/promises";
import type { DownloadCheckpoint } from "./checkpoint";
import type {
  CancelJobOptions,
  CreateJobInput,
  DownloadJob,
  JobProgress,
  JobStatus,
  ListJobsFilter,
} from "./job";
import {
  canCancel,
  canPause,
  canResume,
  isRecoverableCrashStatus,
  isUnfinishedStatus,
} from "./job-state";
import { buildNewJob, type JobStore } from "./job-store";

export type JobEvent =
  | { type: "updated"; job: DownloadJob }
  | { type: "recovered"; jobs: DownloadJob[] };

export type JobEventListener = (event: JobEvent) => void;

type AbortReason = "pause" | "cancel";

interface ActiveHandle {
  abort: AbortController;
  reason?: AbortReason;
}

/**
 * Owns job lifecycle, pause/cancel signals, and crash recovery.
 * Download bytes / segments are handled by ResumeManager + downloaders.
 */
export class JobManager {
  private readonly store: JobStore;
  private readonly active = new Map<string, ActiveHandle>();
  private readonly listeners = new Set<JobEventListener>();
  private ready = false;

  constructor(store: JobStore) {
    this.store = store;
  }

  async init(): Promise<void> {
    if (this.ready) return;
    await this.store.init();
    this.ready = true;
  }

  on(listener: JobEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: JobEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  private async persist(job: DownloadJob): Promise<DownloadJob> {
    const next = { ...job, updatedAt: Date.now() };
    await this.store.upsertJob(next);
    this.emit({ type: "updated", job: next });
    return next;
  }

  async create(input: CreateJobInput): Promise<DownloadJob> {
    await this.init();
    const job = buildNewJob(input);
    return this.persist(job);
  }

  async get(id: string): Promise<DownloadJob | null> {
    await this.init();
    return this.store.getJob(id);
  }

  async list(filter?: ListJobsFilter): Promise<DownloadJob[]> {
    await this.init();
    return this.store.listJobs(filter);
  }

  async updateStatus(
    id: string,
    status: JobStatus,
    extra?: Partial<DownloadJob>
  ): Promise<DownloadJob> {
    await this.init();
    const job = await this.store.getJob(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    return this.persist({ ...job, ...extra, status });
  }

  async updateProgress(id: string, progress: Partial<JobProgress>): Promise<DownloadJob> {
    await this.init();
    const job = await this.store.getJob(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    const nextProgress: JobProgress = {
      ...job.progress,
      ...progress,
    };
    if (
      nextProgress.totalBytes &&
      nextProgress.totalBytes > 0 &&
      progress.percent === undefined
    ) {
      nextProgress.percent =
        Math.round((nextProgress.downloadedBytes / nextProgress.totalBytes) * 10000) / 100;
    }
    return this.persist({ ...job, progress: nextProgress, status: job.status === "queued" ? "downloading" : job.status });
  }

  /** Register an AbortController for cooperative pause/cancel. */
  attachAbort(jobId: string, abort: AbortController): void {
    this.active.set(jobId, { abort });
  }

  detachAbort(jobId: string): void {
    this.active.delete(jobId);
  }

  getAbortSignal(jobId: string): AbortSignal | undefined {
    return this.active.get(jobId)?.abort.signal;
  }

  lastAbortReason(jobId: string): AbortReason | undefined {
    return this.active.get(jobId)?.reason;
  }

  async pause(id: string): Promise<DownloadJob> {
    await this.init();
    const job = await this.store.getJob(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    if (!canPause(job)) {
      return job;
    }
    const handle = this.active.get(id);
    if (handle) {
      handle.reason = "pause";
      handle.abort.abort();
    }
    return this.persist({ ...job, status: "paused", error: undefined });
  }

  async resume(id: string): Promise<DownloadJob> {
    await this.init();
    const job = await this.store.getJob(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    if (!canResume(job)) {
      return job;
    }
    return this.persist({
      ...job,
      status: "queued",
      error: undefined,
    });
  }

  async cancel(id: string, opts: CancelJobOptions = {}): Promise<DownloadJob> {
    await this.init();
    const job = await this.store.getJob(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    if (!canCancel(job)) {
      return job;
    }
    const handle = this.active.get(id);
    if (handle) {
      handle.reason = "cancel";
      handle.abort.abort();
    }
    if (opts.deleteFiles) {
      await this.deleteJobFiles(job);
      await this.store.deleteCheckpoint(id);
    }
    return this.persist({
      ...job,
      status: "cancelled",
      error: opts.deleteFiles ? "Cancelled (files deleted)" : "Cancelled",
    });
  }

  private async deleteJobFiles(job: DownloadJob): Promise<void> {
    const paths = [job.files.temp, job.files.final, job.files.jobDir].filter(
      Boolean
    ) as string[];
    for (const p of paths) {
      await fs.rm(p, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async saveCheckpoint(cp: DownloadCheckpoint): Promise<void> {
    await this.init();
    await this.store.saveCheckpoint(cp);
  }

  async getCheckpoint(jobId: string): Promise<DownloadCheckpoint | null> {
    await this.init();
    return this.store.getCheckpoint(jobId);
  }

  async deleteCheckpoint(jobId: string): Promise<void> {
    await this.init();
    await this.store.deleteCheckpoint(jobId);
  }

  /**
   * On startup: mark in-flight jobs as paused so UI can offer resume.
   * Does not auto-start downloads (caller decides).
   */
  async recover(): Promise<DownloadJob[]> {
    await this.init();
    const all = await this.store.listJobs();
    const recovered: DownloadJob[] = [];
    for (const job of all) {
      if (!isRecoverableCrashStatus(job.status)) continue;
      const next = await this.persist({
        ...job,
        status: "paused",
        error: job.error ?? "Interrupted — ready to resume",
      });
      recovered.push(next);
    }
    this.emit({ type: "recovered", jobs: recovered });
    return recovered;
  }

  async listUnfinished(): Promise<DownloadJob[]> {
    await this.init();
    const all = await this.store.listJobs();
    return all.filter((j) => isUnfinishedStatus(j.status));
  }
}

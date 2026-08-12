import type { DownloadResult, ProcessBoardOptions } from "@pinforge/types";
import type { DownloadJob, CancelJobOptions, CreateJobInput, ListJobsFilter } from "./jobs/job";
import { JobManager } from "./jobs/job-manager";
import { FileJobStore } from "./jobs/job-store";
import { jobStatusToPackStatus } from "./jobs/job-state";
import { ResumeManager } from "@pinforge/download";
import { defaultMediaCoreRoot, ensureJobTempDir } from "./storage/temp";
import { tools, type ToolRegistry } from "@pinforge/tools";
import { JobScheduler } from "./scheduler";

/** Injected by `@pinforge/core` so engine never imports the façade. */
export type ProcessMediaFn = (url: string, opts: ProcessBoardOptions) => Promise<DownloadResult>;

export interface MediaCoreOptions {
  /** Root for jobs.db.json + job workdirs. */
  dataDir?: string;
  tools?: ToolRegistry;
  /** Required for download/job execution — wired by `@pinforge/core`. */
  processMedia?: ProcessMediaFn;
}

export interface MediaCoreDownloadOptions extends ProcessBoardOptions {
  url: string;
  title?: string;
  provider?: string;
  packId?: string;
  /** Auto-start worker after create (default true). */
  autoStart?: boolean;
}

export interface MediaCoreJobHandle {
  id: string;
  get(): Promise<DownloadJob | null>;
  pause(): Promise<DownloadJob>;
  resume(): Promise<DownloadJob>;
  cancel(opts?: CancelJobOptions): Promise<DownloadJob>;
  /** Wait until terminal status (completed/failed/cancelled). */
  wait(): Promise<DownloadJob>;
}

function combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary) return primary;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([primary, secondary]);
  }
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (primary.aborted || secondary.aborted) {
    ctrl.abort();
    return ctrl.signal;
  }
  primary.addEventListener("abort", onAbort, { once: true });
  secondary.addEventListener("abort", onAbort, { once: true });
  return ctrl.signal;
}

/**
 * Public MediaCore SDK — jobs, resume, tools.
 */
export class MediaCore {
  readonly jobs: JobManager;
  readonly resume: ResumeManager;
  readonly tools: ToolRegistry;
  readonly dataDir: string;
  private readonly scheduler: JobScheduler;
  private readonly processMediaFn: ProcessMediaFn | undefined;
  private initPromise: Promise<void> | null = null;

  constructor(opts: MediaCoreOptions = {}) {
    this.dataDir = defaultMediaCoreRoot(opts.dataDir);
    const store = new FileJobStore(this.dataDir);
    this.jobs = new JobManager(store);
    this.resume = new ResumeManager({ jobs: this.jobs });
    this.tools = opts.tools ?? tools;
    this.processMediaFn = opts.processMedia;
    this.scheduler = new JobScheduler(this.jobs);
  }

  private requireProcessMedia(): ProcessMediaFn {
    if (!this.processMediaFn) {
      throw new Error(
        "MediaCore processMedia is not configured. Call configureMediaCore({ processMedia }) from @pinforge/core."
      );
    }
    return this.processMediaFn;
  }

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.jobs.init();
    }
    await this.initPromise;
  }

  private handleFor(id: string): MediaCoreJobHandle {
    const jobs = this.jobs;
    const scheduler = this.scheduler;
    return {
      id,
      get: () => jobs.get(id),
      pause: () => jobs.pause(id),
      resume: async () => {
        const job = await jobs.resume(id);
        return job;
      },
      cancel: (o) => jobs.cancel(id, o),
      wait: () => scheduler.wait(id),
    };
  }

  /**
   * Create a job and optionally run processMedia under job lifecycle.
   */
  async download(opts: MediaCoreDownloadOptions): Promise<MediaCoreJobHandle> {
    await this.init();
    const { url, autoStart = true, title, provider, packId, ...processOpts } = opts;
    const job = await this.jobs.create({
      url,
      outputDir: processOpts.outDir,
      title,
      provider,
      packId,
    } satisfies CreateJobInput);
    await ensureJobTempDir(this.dataDir, job.id);

    if (autoStart) {
      void this.runExistingJob(job.id, { url, ...processOpts });
    }

    return this.handleFor(job.id);
  }

  /** Execute processMedia for an existing job id. */
  async runExistingJob(
    jobId: string,
    processOpts: ProcessBoardOptions & { url: string; title?: string; packId?: string }
  ): Promise<{ job: DownloadJob; result: DownloadResult }> {
    await this.init();
    this.scheduler.enqueue(jobId);
    try {
      return await this.executeJob(jobId, processOpts);
    } finally {
      const final = await this.jobs.get(jobId);
      if (final) this.scheduler.complete(jobId, final);
      else this.scheduler.complete(jobId);
    }
  }

  private async executeJob(
    jobId: string,
    opts: ProcessBoardOptions & { url: string; title?: string; packId?: string }
  ): Promise<{ job: DownloadJob; result: DownloadResult }> {
    const existing = await this.jobs.get(jobId);
    if (!existing) throw new Error(`Job not found: ${jobId}`);

    const url = opts.url;
    const abort = new AbortController();
    this.jobs.attachAbort(jobId, abort);
    const linked = combineSignals(abort.signal, opts.signal);
    const processMedia = this.requireProcessMedia();

    try {
      await this.jobs.updateStatus(jobId, "analyzing");
      const jobDir = await ensureJobTempDir(this.dataDir, jobId);
      await this.jobs.updateStatus(jobId, "downloading", {
        files: { ...existing.files, jobDir, temp: jobDir },
      });

      const result = await processMedia(url, {
        ...opts,
        signal: linked,
        onProgress: (info) => {
          opts.onProgress?.(info);
          const phase = info.phase;
          if (phase === "mux" || phase === "convert" || phase === "enhance") {
            void this.jobs.updateStatus(jobId, "processing");
          }
          if (typeof info.downloaded === "number") {
            void this.jobs.updateProgress(jobId, {
              downloadedBytes: info.downloaded,
              totalBytes: info.totalBytes ?? undefined,
              percent: info.percent,
            });
          }
        },
      });

      const reason = this.jobs.lastAbortReason(jobId);
      if (abort.signal.aborted || linked.aborted) {
        if (reason === "pause") {
          const paused = await this.jobs.updateStatus(jobId, "paused");
          return { job: paused, result };
        }
        const cancelled = await this.jobs.updateStatus(jobId, "cancelled");
        return { job: cancelled, result };
      }

      const status =
        result.errors.length === 0
          ? "completed"
          : result.results.length === 0
            ? "failed"
            : "completed";
      const final = await this.jobs.updateStatus(jobId, status, {
        provider: result.provider,
        title: result.results[0]?.title ?? opts.title ?? existing.title,
        files: {
          jobDir,
          final: result.results[0]?.outPath,
        },
        error: result.errors[0]?.error,
        progress: {
          downloadedBytes: existing.progress.downloadedBytes,
          percent: status === "completed" ? 100 : existing.progress.percent,
        },
      });
      return { job: final, result };
    } catch (err) {
      const reason = this.jobs.lastAbortReason(jobId);
      const aborted =
        reason === "pause" ||
        reason === "cancel" ||
        (err instanceof Error &&
          (err.name === "AbortError" || /aborted|stopped/i.test(err.message)));
      if (aborted) {
        if (reason === "pause") {
          const paused = await this.jobs.updateStatus(jobId, "paused");
          return {
            job: paused,
            result: {
              results: [],
              errors: [{ url, error: "Paused" }],
              kind: "single",
              provider: (existing.provider ?? "youtube") as DownloadResult["provider"],
            },
          };
        }
        const cancelled = await this.jobs.updateStatus(jobId, "cancelled", {
          error: "Cancelled",
        });
        return {
          job: cancelled,
          result: {
            results: [],
            errors: [{ url, error: "Cancelled" }],
            kind: "single",
            provider: (existing.provider ?? "youtube") as DownloadResult["provider"],
          },
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      const failed = await this.jobs.updateStatus(jobId, "failed", { error: message });
      throw Object.assign(err instanceof Error ? err : new Error(message), { job: failed });
    } finally {
      this.jobs.detachAbort(jobId);
    }
  }

  /**
   * Create job + run processMedia (used by desktop dual-write).
   */
  async processMediaAsJob(
    url: string,
    opts: ProcessBoardOptions & { packId?: string; title?: string }
  ): Promise<{ job: DownloadJob; result: DownloadResult }> {
    await this.init();
    const job = await this.jobs.create({
      url,
      outputDir: opts.outDir,
      packId: opts.packId,
      title: opts.title,
    });
    return this.runExistingJob(job.id, { url, ...opts });
  }

  async recover(): Promise<DownloadJob[]> {
    await this.init();
    return this.jobs.recover();
  }

  async listJobs(filter?: ListJobsFilter): Promise<DownloadJob[]> {
    await this.init();
    return this.jobs.list(filter);
  }
}

let singleton: MediaCore | null = null;

/** Shared MediaCore instance (desktop/CLI should call configureMediaCore first). */
export function getMediaCore(): MediaCore {
  if (!singleton) singleton = new MediaCore();
  return singleton;
}

export function configureMediaCore(opts: MediaCoreOptions): MediaCore {
  singleton = new MediaCore(opts);
  return singleton;
}

export { jobStatusToPackStatus };

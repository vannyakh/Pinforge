import fs from "node:fs/promises";
import path from "node:path";
import type { DownloadCheckpoint, SegmentCheckpoint } from "./checkpoint";
import type { CreateJobInput, DownloadJob, ListJobsFilter } from "./job";
import { createJobId, progressPercent } from "./job";

/**
 * Pluggable job persistence. FileJobStore mirrors the planned SQLite schema
 * (jobs / checkpoints / segments) with atomic JSON — Electron-friendly, no native rebuild.
 */
export interface JobStore {
  init(): Promise<void>;
  close(): Promise<void>;
  upsertJob(job: DownloadJob): Promise<void>;
  getJob(id: string): Promise<DownloadJob | null>;
  listJobs(filter?: ListJobsFilter): Promise<DownloadJob[]>;
  deleteJob(id: string): Promise<void>;
  saveCheckpoint(cp: DownloadCheckpoint): Promise<void>;
  getCheckpoint(jobId: string): Promise<DownloadCheckpoint | null>;
  deleteCheckpoint(jobId: string): Promise<void>;
  saveSegments(jobId: string, segments: SegmentCheckpoint[]): Promise<void>;
  getSegments(jobId: string): Promise<SegmentCheckpoint[]>;
}

interface StoreDump {
  version: 1;
  jobs: Record<string, DownloadJob>;
  checkpoints: Record<string, DownloadCheckpoint>;
  segments: Record<string, SegmentCheckpoint[]>;
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, filePath);
}

export class FileJobStore implements JobStore {
  private readonly dbPath: string;
  private data: StoreDump = {
    version: 1,
    jobs: {},
    checkpoints: {},
    segments: {},
  };
  private writeChain: Promise<void> = Promise.resolve();

  constructor(dbDir: string) {
    this.dbPath = path.join(dbDir, "jobs.db.json");
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    try {
      const raw = await fs.readFile(this.dbPath, "utf8");
      const parsed = JSON.parse(raw) as StoreDump;
      if (parsed?.version === 1 && parsed.jobs) {
        this.data = {
          version: 1,
          jobs: parsed.jobs ?? {},
          checkpoints: parsed.checkpoints ?? {},
          segments: parsed.segments ?? {},
        };
      }
    } catch {
      await this.flush();
    }
  }

  async close(): Promise<void> {
    await this.writeChain;
  }

  private enqueueWrite(): Promise<void> {
    this.writeChain = this.writeChain.then(() => this.flush()).catch(() => this.flush());
    return this.writeChain;
  }

  private async flush(): Promise<void> {
    await atomicWrite(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  async upsertJob(job: DownloadJob): Promise<void> {
    const percent = progressPercent(job.progress);
    this.data.jobs[job.id] = {
      ...job,
      progress: {
        ...job.progress,
        percent: percent ?? job.progress.percent,
      },
      updatedAt: Date.now(),
    };
    await this.enqueueWrite();
  }

  async getJob(id: string): Promise<DownloadJob | null> {
    return this.data.jobs[id] ?? null;
  }

  async listJobs(filter?: ListJobsFilter): Promise<DownloadJob[]> {
    let rows = Object.values(this.data.jobs);
    if (filter?.status?.length) {
      const set = new Set(filter.status);
      rows = rows.filter((j) => set.has(j.status));
    }
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    if (filter?.limit && filter.limit > 0) {
      rows = rows.slice(0, filter.limit);
    }
    return rows;
  }

  async deleteJob(id: string): Promise<void> {
    delete this.data.jobs[id];
    delete this.data.checkpoints[id];
    delete this.data.segments[id];
    await this.enqueueWrite();
  }

  async saveCheckpoint(cp: DownloadCheckpoint): Promise<void> {
    this.data.checkpoints[cp.jobId] = { ...cp, updatedAt: Date.now() };
    if (cp.segments) {
      this.data.segments[cp.jobId] = cp.segments;
    }
    await this.enqueueWrite();
  }

  async getCheckpoint(jobId: string): Promise<DownloadCheckpoint | null> {
    const cp = this.data.checkpoints[jobId];
    if (!cp) return null;
    const segments = this.data.segments[jobId] ?? cp.segments;
    return segments ? { ...cp, segments } : cp;
  }

  async deleteCheckpoint(jobId: string): Promise<void> {
    delete this.data.checkpoints[jobId];
    delete this.data.segments[jobId];
    await this.enqueueWrite();
  }

  async saveSegments(jobId: string, segments: SegmentCheckpoint[]): Promise<void> {
    this.data.segments[jobId] = segments;
    const cp = this.data.checkpoints[jobId];
    if (cp) {
      this.data.checkpoints[jobId] = { ...cp, segments, updatedAt: Date.now() };
    }
    await this.enqueueWrite();
  }

  async getSegments(jobId: string): Promise<SegmentCheckpoint[]> {
    return this.data.segments[jobId] ?? this.data.checkpoints[jobId]?.segments ?? [];
  }
}

export function buildNewJob(input: CreateJobInput): DownloadJob {
  const now = Date.now();
  return {
    id: createJobId(),
    url: input.url,
    status: "queued",
    provider: input.provider,
    format: input.format,
    progress: { downloadedBytes: 0 },
    files: {},
    outputDir: input.outputDir,
    title: input.title,
    packId: input.packId,
    createdAt: now,
    updatedAt: now,
  };
}

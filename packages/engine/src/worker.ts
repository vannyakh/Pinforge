import type { ProcessBoardOptions } from "@pinforge/types";
import type { MediaCore } from "./engine";

export interface JobWorkerOptions {
  core: MediaCore;
  jobId: string;
  processOpts: ProcessBoardOptions & { url: string };
}

/**
 * Runs a single existing job via MediaCore.runExistingJob.
 */
export async function runJobWorker(opts: JobWorkerOptions): Promise<void> {
  const { core, jobId, processOpts } = opts;
  try {
    await core.runExistingJob(jobId, processOpts);
  } catch {
    /* status persisted on failure */
  }
}

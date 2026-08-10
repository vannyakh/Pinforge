import { downloadToBuffer } from "./fragment";
import type { FragmentDownloadOptions, FragmentDownloadResult } from "./fragment";
import { rustDownload } from "../worker/rustWorker";

export { mapPool, runPool } from "./pool";
export type { MapPoolOptions, PoolTask } from "./pool";
export { downloadToBuffer } from "./fragment";
export type { FragmentDownloadOptions, FragmentDownloadResult } from "./fragment";
export {
  rangeDownloadToFile,
  probeRangeResource,
  downloadSegments,
  ResumeManager,
  CheckpointStore,
  validateCheckpoint,
  recoverCheckpoint,
} from "./downloader";
export type {
  RangeDownloadOptions,
  RangeProbe,
  SegmentDownloadOptions,
  SegmentDownloadResult,
  RecoveryResult,
} from "./downloader";

/**
 * Prefer validated Range downloader when resume is on.
 * Rust worker is only used for non-resume downloads (no checkpoint contract yet).
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  opts: FragmentDownloadOptions = {}
): Promise<FragmentDownloadResult> {
  if (opts.resume) {
    const { rangeDownloadToFile } = await import("./range-downloader");
    return rangeDownloadToFile(url, destPath, opts);
  }

  try {
    const rust = await rustDownload({
      url,
      outPath: destPath,
      concurrency: opts.concurrency,
      referer: opts.referer,
    });
    if (rust) {
      return {
        filePath: rust.path,
        bytes: rust.bytes,
        contentType: null,
        usedFragments: rust.usedFragments,
      };
    }
  } catch {
    /* fall through */
  }

  const { downloadToFile: tsDownload } = await import("./fragment");
  return tsDownload(url, destPath, opts);
}

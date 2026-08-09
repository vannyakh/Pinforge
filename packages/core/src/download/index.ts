import { downloadToBuffer } from "./fragment";
import type { FragmentDownloadOptions, FragmentDownloadResult } from "./fragment";
import { rustDownload } from "../worker/rustWorker";

export { mapPool, runPool } from "./pool";
export type { MapPoolOptions, PoolTask } from "./pool";
export { downloadToBuffer } from "./fragment";
export type { FragmentDownloadOptions, FragmentDownloadResult } from "./fragment";

/**
 * Prefer Rust worker for fragment downloads when available; else TS Range pool.
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  opts: FragmentDownloadOptions = {}
): Promise<FragmentDownloadResult> {
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

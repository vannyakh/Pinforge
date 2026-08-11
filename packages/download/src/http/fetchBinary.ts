import { downloadToBuffer } from "../fragment";
import { extFromUrlOrType } from "./helpers";

export async function fetchBinary(
  url: string,
  opts?: {
    referer?: string;
    accept?: string;
    /** Parallel Range fragments for large files (default 4). */
    concurrency?: number;
    signal?: AbortSignal;
  }
): Promise<{ buffer: Buffer; ext: string; contentType: string | null; usedFragments?: boolean }> {
  const { buffer, contentType, usedFragments } = await downloadToBuffer(url, {
    referer: opts?.referer,
    accept: opts?.accept ?? "*/*",
    concurrency: opts?.concurrency ?? 4,
    signal: opts?.signal,
  });
  const ext = extFromUrlOrType(url, contentType);
  return { buffer, ext, contentType, usedFragments };
}

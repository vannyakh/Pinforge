/**
 * HTTP Range downloader with checkpoint validation.
 * Wraps fragment download and persists DownloadCheckpoint metadata.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { EXTRACTOR_HEADERS } from "./http/headers";
import type { DownloadCheckpoint } from "./checkpoint";
import { mapPool } from "./pool";
import { ResumeManager } from "./resume/resume-manager";
import type { FragmentDownloadOptions, FragmentDownloadResult } from "./fragment";

export interface RangeDownloadOptions extends FragmentDownloadOptions {
  jobId?: string;
  jobDir?: string;
  provider?: string;
  formatId?: string;
  resumeManager?: ResumeManager;
}

export interface RangeProbe {
  length: number | null;
  acceptRanges: boolean;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
}

function buildHeaders(opts?: RangeDownloadOptions): Record<string, string> {
  return {
    ...EXTRACTOR_HEADERS,
    Accept: opts?.accept ?? "*/*",
    ...(opts?.referer ? { Referer: opts.referer } : {}),
    ...opts?.headers,
  };
}

export async function probeRangeResource(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<RangeProbe> {
  try {
    const head = await fetch(url, { method: "HEAD", headers, redirect: "follow", signal });
    if (head.ok) {
      const length = Number(head.headers.get("content-length"));
      return {
        length: Number.isFinite(length) && length > 0 ? length : null,
        acceptRanges: /bytes/i.test(head.headers.get("accept-ranges") ?? ""),
        contentType: head.headers.get("content-type"),
        etag: head.headers.get("etag"),
        lastModified: head.headers.get("last-modified"),
      };
    }
  } catch {
    /* fall through */
  }

  try {
    const probe = await fetch(url, {
      headers: { ...headers, Range: "bytes=0-0" },
      redirect: "follow",
      signal,
    });
    const etag = probe.headers.get("etag");
    const lastModified = probe.headers.get("last-modified");
    if (probe.status === 206) {
      const contentRange = probe.headers.get("content-range");
      const total = contentRange?.match(/\/(\d+)$/)?.[1];
      const length = total ? Number(total) : null;
      await probe.arrayBuffer().catch(() => undefined);
      return {
        length: Number.isFinite(length) && (length ?? 0) > 0 ? length : null,
        acceptRanges: true,
        contentType: probe.headers.get("content-type"),
        etag,
        lastModified,
      };
    }
    if (probe.ok) {
      const length = Number(probe.headers.get("content-length"));
      await probe.arrayBuffer().catch(() => undefined);
      return {
        length: Number.isFinite(length) && length > 0 ? length : null,
        acceptRanges: false,
        contentType: probe.headers.get("content-type"),
        etag,
        lastModified,
      };
    }
  } catch {
    /* ignore */
  }

  return {
    length: null,
    acceptRanges: false,
    contentType: null,
    etag: null,
    lastModified: null,
  };
}

async function downloadFragment(
  url: string,
  headers: Record<string, string>,
  start: number,
  end: number,
  signal?: AbortSignal
): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { ...headers, Range: `bytes=${start}-${end}` },
    redirect: "follow",
    signal,
  });
  if (!(res.status === 206 || res.status === 200)) {
    throw new Error(`Fragment download failed (${res.status}) bytes=${start}-${end}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Append-from-offset single stream when server honors Range.
 * If server returns 200 instead of 206, restarts the file (does not corrupt-append).
 */
async function downloadStreamResumable(
  url: string,
  destPath: string,
  headers: Record<string, string>,
  opts: RangeDownloadOptions,
  offset: number
): Promise<FragmentDownloadResult> {
  const rangeHeaders = offset > 0 ? { ...headers, Range: `bytes=${offset}-` } : headers;
  const res = await fetch(url, {
    headers: rangeHeaders,
    redirect: "follow",
    signal: opts.signal,
  });

  if (!res.ok && res.status !== 206) {
    throw new Error(`Failed to download media (${res.status}): ${url}`);
  }
  if (!res.body) throw new Error("Empty response body");

  // Server ignored Range — must restart, not append
  if (offset > 0 && res.status === 200) {
    await fsp.unlink(destPath).catch(() => undefined);
    offset = 0;
  }

  const totalHeader = Number(res.headers.get("content-length"));
  let totalBytes: number | null = null;
  if (res.status === 206) {
    const cr = res.headers.get("content-range");
    const total = cr?.match(/\/(\d+)$/)?.[1];
    totalBytes = total ? Number(total) : null;
  } else if (Number.isFinite(totalHeader) && totalHeader > 0) {
    totalBytes = totalHeader;
  }

  let downloaded = offset;
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const flags = offset > 0 ? "a" : "w";
  const nodeReadable = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  nodeReadable.on("data", (chunk: Buffer | string) => {
    downloaded += Buffer.byteLength(chunk);
    opts.onProgress?.({ downloaded, total: totalBytes });
  });

  await pipeline(nodeReadable, fs.createWriteStream(destPath, { flags }));
  return {
    filePath: destPath,
    bytes: downloaded,
    contentType: res.headers.get("content-type"),
    usedFragments: false,
  };
}

/**
 * Range-aware download with ETag/Last-Modified checkpoint validation.
 */
export async function rangeDownloadToFile(
  url: string,
  destPath: string,
  opts: RangeDownloadOptions = {}
): Promise<FragmentDownloadResult> {
  const headers = buildHeaders(opts);
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const minSize = opts.minSizeForFragments ?? 2 * 1024 * 1024;
  const fragmentSize = opts.fragmentSize ?? 4 * 1024 * 1024;
  const resume = Boolean(opts.resume);
  const jobDir = opts.jobDir ?? path.dirname(destPath);
  const jobId = opts.jobId ?? `anon_${path.basename(destPath)}`;
  const resumeManager = opts.resumeManager ?? new ResumeManager();
  const statePath = `${destPath}.part.json`;
  const tempPath = `${destPath}.part`;

  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  await fsp.mkdir(jobDir, { recursive: true });

  const probe = await probeRangeResource(url, headers, opts.signal);

  let completed: Array<{ start: number; end: number }> = [];
  let resumeOffset = 0;

  if (resume) {
    const recovery = await resumeManager.recover(jobDir, {
      url,
      etag: probe.etag,
      lastModified: probe.lastModified,
      contentLength: probe.length,
      formatId: opts.formatId,
    });
    if (recovery.action === "restart") {
      await fsp.unlink(tempPath).catch(() => undefined);
      await fsp.unlink(statePath).catch(() => undefined);
      await resumeManager.clear(jobDir, jobId);
    } else if (recovery.checkpoint) {
      completed = recovery.checkpoint.completedRanges ?? [];
      resumeOffset = recovery.checkpoint.downloadedBytes ?? 0;
      if (recovery.checkpoint.partPath && recovery.checkpoint.partPath !== tempPath) {
        /* prefer standard .part next to dest */
      }
    } else {
      // Legacy .part.json fallback
      try {
        const raw = await fsp.readFile(statePath, "utf8");
        const state = JSON.parse(raw) as {
          url?: string;
          total?: number;
          etag?: string;
          lastModified?: string;
          completedRanges?: Array<{ start: number; end: number }>;
        };
        if (
          state.url === url &&
          state.total === probe.length &&
          Array.isArray(state.completedRanges) &&
          (!state.etag || !probe.etag || state.etag === probe.etag)
        ) {
          completed = state.completedRanges;
        }
      } catch {
        completed = [];
      }
      try {
        const st = await fsp.stat(tempPath);
        resumeOffset = st.size;
      } catch {
        resumeOffset = 0;
      }
    }
  }

  const writeCheckpoint = async (partial: Partial<DownloadCheckpoint>) => {
    const cp: DownloadCheckpoint = {
      jobId,
      url,
      provider: opts.provider,
      formatId: opts.formatId,
      type: "http",
      downloadedBytes: partial.downloadedBytes ?? 0,
      totalBytes: probe.length ?? undefined,
      etag: probe.etag ?? undefined,
      lastModified: probe.lastModified ?? undefined,
      contentLength: probe.length ?? undefined,
      partPath: tempPath,
      finalPath: destPath,
      completedRanges: partial.completedRanges,
      updatedAt: Date.now(),
      ...partial,
    };
    await resumeManager.save(jobDir, cp);
    if (resume) {
      await fsp.writeFile(
        statePath,
        JSON.stringify({
          url,
          destPath,
          total: probe.length,
          etag: probe.etag,
          lastModified: probe.lastModified,
          completedRanges: cp.completedRanges ?? [],
          updatedAt: Date.now(),
        }),
        "utf8"
      );
    }
  };

  try {
    if (!probe.acceptRanges || !probe.length || probe.length < minSize || concurrency <= 1) {
      const offset = resume ? resumeOffset : 0;
      const streamed = await downloadStreamResumable(url, tempPath, headers, opts, offset);
      await writeCheckpoint({
        downloadedBytes: streamed.bytes,
        completedRanges: [],
      });
      await fsp.rename(tempPath, destPath);
      await fsp.unlink(statePath).catch(() => undefined);
      await resumeManager.clear(jobDir, jobId);
      return {
        ...streamed,
        filePath: destPath,
        contentType: streamed.contentType ?? probe.contentType,
      };
    }

    const total = probe.length;
    const ranges: Array<{ start: number; end: number; index: number }> = [];
    for (let start = 0, index = 0; start < total; start += fragmentSize, index++) {
      const end = Math.min(start + fragmentSize - 1, total - 1);
      ranges.push({ start, end, index });
    }

    const openFlags = resume && completed.length > 0 ? "r+" : "w";
    const fh = await fsp.open(tempPath, openFlags);
    try {
      if (openFlags === "w") await fh.truncate(total);
      let downloaded = completed.reduce((n, r) => n + (r.end - r.start + 1), 0);
      opts.onProgress?.({ downloaded: Math.min(downloaded, total), total });
      await writeCheckpoint({ downloadedBytes: downloaded, completedRanges: completed });

      const pending = ranges.filter(
        (r) => !completed.some((c) => c.start === r.start && c.end === r.end)
      );

      await mapPool(
        pending,
        concurrency,
        async (range: { start: number; end: number; index: number }) => {
          const buf = await downloadFragment(url, headers, range.start, range.end, opts.signal);
          await fh.write(buf, 0, buf.length, range.start);
          downloaded += buf.length;
          if (resume) {
            completed.push({ start: range.start, end: range.end });
            await writeCheckpoint({
              downloadedBytes: Math.min(downloaded, total),
              completedRanges: [...completed],
            });
          }
          opts.onProgress?.({ downloaded: Math.min(downloaded, total), total });
        }
      );
    } finally {
      await fh.close();
    }

    await fsp.rename(tempPath, destPath);
    await fsp.unlink(statePath).catch(() => undefined);
    await resumeManager.clear(jobDir, jobId);
    return {
      filePath: destPath,
      bytes: total,
      contentType: probe.contentType,
      usedFragments: true,
    };
  } catch (err) {
    if (!resume) {
      await fsp.unlink(tempPath).catch(() => undefined);
      await fsp.unlink(statePath).catch(() => undefined);
    }
    throw err;
  }
}

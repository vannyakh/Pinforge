import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { EXTRACTOR_HEADERS } from "./http/headers";
import { mapPool } from "./pool";

export interface FragmentDownloadOptions {
  headers?: Record<string, string>;
  referer?: string;
  accept?: string;
  /** Parallel Range connections (default 4). */
  concurrency?: number;
  /** Min size (bytes) before using multi-fragment mode (default 2MB). */
  minSizeForFragments?: number;
  /** Fragment size in bytes (default 4MB). */
  fragmentSize?: number;
  signal?: AbortSignal;
  onProgress?: (info: { downloaded: number; total: number | null }) => void;
  /** Keep .part and skip completed ranges on retry (default false). */
  resume?: boolean;
}

export interface FragmentDownloadResult {
  filePath: string;
  bytes: number;
  contentType: string | null;
  usedFragments: boolean;
}

function buildHeaders(opts?: FragmentDownloadOptions): Record<string, string> {
  return {
    ...EXTRACTOR_HEADERS,
    Accept: opts?.accept ?? "*/*",
    ...(opts?.referer ? { Referer: opts.referer } : {}),
    ...opts?.headers,
  };
}

async function probeSize(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<{ length: number | null; acceptRanges: boolean; contentType: string | null }> {
  try {
    const head = await fetch(url, { method: "HEAD", headers, redirect: "follow", signal });
    if (head.ok) {
      const length = Number(head.headers.get("content-length"));
      const acceptRanges = /bytes/i.test(head.headers.get("accept-ranges") ?? "");
      return {
        length: Number.isFinite(length) && length > 0 ? length : null,
        acceptRanges,
        contentType: head.headers.get("content-type"),
      };
    }
  } catch {
    /* fall through to ranged probe */
  }

  try {
    const probe = await fetch(url, {
      headers: { ...headers, Range: "bytes=0-0" },
      redirect: "follow",
      signal,
    });
    if (probe.status === 206) {
      const contentRange = probe.headers.get("content-range");
      const total = contentRange?.match(/\/(\d+)$/)?.[1];
      const length = total ? Number(total) : null;
      await probe.arrayBuffer().catch(() => undefined);
      return {
        length: Number.isFinite(length) && (length ?? 0) > 0 ? length : null,
        acceptRanges: true,
        contentType: probe.headers.get("content-type"),
      };
    }
    if (probe.ok) {
      const length = Number(probe.headers.get("content-length"));
      await probe.arrayBuffer().catch(() => undefined);
      return {
        length: Number.isFinite(length) && length > 0 ? length : null,
        acceptRanges: false,
        contentType: probe.headers.get("content-type"),
      };
    }
  } catch {
    /* ignore */
  }

  return { length: null, acceptRanges: false, contentType: null };
}

async function downloadStreamToFile(
  url: string,
  destPath: string,
  headers: Record<string, string>,
  opts?: FragmentDownloadOptions
): Promise<FragmentDownloadResult> {
  const res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: opts?.signal,
  });
  if (!res.ok) throw new Error(`Failed to download media (${res.status}): ${url}`);
  if (!res.body) throw new Error("Empty response body");

  const total = Number(res.headers.get("content-length"));
  const totalBytes = Number.isFinite(total) && total > 0 ? total : null;
  let downloaded = 0;

  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const nodeReadable = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  nodeReadable.on("data", (chunk: Buffer | string) => {
    downloaded += Buffer.byteLength(chunk);
    opts?.onProgress?.({ downloaded, total: totalBytes });
  });

  await pipeline(nodeReadable, fs.createWriteStream(destPath));
  return {
    filePath: destPath,
    bytes: downloaded,
    contentType: res.headers.get("content-type"),
    usedFragments: false,
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
    headers: {
      ...headers,
      Range: `bytes=${start}-${end}`,
    },
    redirect: "follow",
    signal,
  });
  if (!(res.status === 206 || res.status === 200)) {
    throw new Error(`Fragment download failed (${res.status}) bytes=${start}-${end}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Multi-connection Range download into a file (fragment / multi-thread style).
 * Falls back to single stream when ranges are unavailable.
 * When `resume` is true, keeps `.part` + `.part.json` across failures and skips done ranges.
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  opts: FragmentDownloadOptions = {}
): Promise<FragmentDownloadResult> {
  const headers = buildHeaders(opts);
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const minSize = opts.minSizeForFragments ?? 2 * 1024 * 1024;
  const resume = Boolean(opts.resume);
  const statePath = `${destPath}.part.json`;

  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const tempPath = `${destPath}.part`;

  try {
    const probe = await probeSize(url, headers, opts.signal);

    if (!probe.acceptRanges || !probe.length || probe.length < minSize || concurrency <= 1) {
      const streamed = await downloadStreamToFile(url, tempPath, headers, opts);
      await fsp.rename(tempPath, destPath);
      await fsp.unlink(statePath).catch(() => undefined);
      return {
        ...streamed,
        filePath: destPath,
        contentType: streamed.contentType ?? probe.contentType,
      };
    }

    const total = probe.length;
    // Larger fragments for high-bitrate / long streams improve throughput.
    const fragmentSize =
      opts.fragmentSize ?? (total >= 50 * 1024 * 1024 ? 8 * 1024 * 1024 : 4 * 1024 * 1024);
    const ranges: Array<{ start: number; end: number; index: number }> = [];
    for (let start = 0, index = 0; start < total; start += fragmentSize, index++) {
      const end = Math.min(start + fragmentSize - 1, total - 1);
      ranges.push({ start, end, index });
    }

    let completed: Array<{ start: number; end: number }> = [];
    if (resume) {
      try {
        const raw = await fsp.readFile(statePath, "utf8");
        const state = JSON.parse(raw) as {
          url?: string;
          total?: number;
          completedRanges?: Array<{ start: number; end: number }>;
        };
        if (state.url === url && state.total === total && Array.isArray(state.completedRanges)) {
          completed = state.completedRanges;
        }
      } catch {
        completed = [];
      }
    }

    const openFlags = resume && completed.length > 0 ? "r+" : "w";
    const fh = await fsp.open(tempPath, openFlags);
    try {
      if (openFlags === "w") await fh.truncate(total);
      let downloaded = completed.reduce((n, r) => n + (r.end - r.start + 1), 0);
      opts?.onProgress?.({ downloaded: Math.min(downloaded, total), total });

      const pending = ranges.filter(
        (r) => !completed.some((c) => c.start === r.start && c.end === r.end)
      );

      await mapPool(pending, concurrency, async (range) => {
        const buf = await downloadFragment(url, headers, range.start, range.end, opts.signal);
        await fh.write(buf, 0, buf.length, range.start);
        downloaded += buf.length;
        if (resume) {
          completed.push({ start: range.start, end: range.end });
          await fsp.writeFile(
            statePath,
            JSON.stringify({
              url,
              destPath,
              total,
              completedRanges: completed,
              updatedAt: Date.now(),
            }),
            "utf8"
          );
        }
        opts?.onProgress?.({ downloaded: Math.min(downloaded, total), total });
      });
    } finally {
      await fh.close();
    }

    await fsp.rename(tempPath, destPath);
    await fsp.unlink(statePath).catch(() => undefined);
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

/**
 * Download into a Buffer using fragment concurrency when beneficial.
 * Prefer downloadToFile for large media to avoid RAM pressure.
 */
export async function downloadToBuffer(
  url: string,
  opts: FragmentDownloadOptions = {}
): Promise<{ buffer: Buffer; contentType: string | null; usedFragments: boolean }> {
  const headers = buildHeaders(opts);
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const minSize = opts.minSizeForFragments ?? 2 * 1024 * 1024;

  const probe = await probeSize(url, headers, opts.signal);

  if (probe.acceptRanges && probe.length && probe.length >= minSize && concurrency > 1) {
    const total = probe.length;
    const fragmentSize =
      opts.fragmentSize ?? (total >= 50 * 1024 * 1024 ? 8 * 1024 * 1024 : 4 * 1024 * 1024);
    const buffer = Buffer.allocUnsafe(total);
    const ranges: Array<{ start: number; end: number }> = [];
    for (let start = 0; start < total; start += fragmentSize) {
      ranges.push({ start, end: Math.min(start + fragmentSize - 1, total - 1) });
    }

    let downloaded = 0;
    await mapPool(ranges, concurrency, async (range) => {
      const part = await downloadFragment(url, headers, range.start, range.end, opts.signal);
      part.copy(buffer, range.start);
      downloaded += part.length;
      opts?.onProgress?.({ downloaded: Math.min(downloaded, total), total });
    });

    return { buffer, contentType: probe.contentType, usedFragments: true };
  }

  const res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Failed to download media (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  opts?.onProgress?.({ downloaded: buffer.length, total: buffer.length });
  return {
    buffer,
    contentType: res.headers.get("content-type") ?? probe.contentType,
    usedFragments: false,
  };
}

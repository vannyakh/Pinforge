import fs from "node:fs/promises";
import path from "node:path";
import { EXTRACTOR_HEADERS } from "../providers/extractors/http";
import type { DownloadCheckpoint, SegmentCheckpoint } from "../jobs/checkpoint";
import { mapPool } from "./pool";
import { ResumeManager } from "./resume/resume-manager";

export interface SegmentDownloadOptions {
  jobId: string;
  jobDir: string;
  headers?: Record<string, string>;
  referer?: string;
  concurrency?: number;
  signal?: AbortSignal;
  resumeManager?: ResumeManager;
  provider?: string;
  type?: "hls" | "dash";
  onProgress?: (info: {
    downloaded: number;
    total: number;
    completedSegments: number;
    totalSegments: number;
  }) => void;
}

export interface SegmentDownloadResult {
  segments: SegmentCheckpoint[];
  segmentPaths: string[];
  downloadedBytes: number;
}

async function fetchSegment(
  url: string,
  headers: Record<string, string>,
  dest: string,
  signal?: AbortSignal
): Promise<number> {
  const res = await fetch(url, { headers, redirect: "follow", signal });
  if (!res.ok) throw new Error(`Segment download failed (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  return buf.length;
}

/**
 * Download media segments with per-segment checkpoint (HLS / DASH).
 */
export async function downloadSegments(
  playlistUrl: string,
  segmentUrls: string[],
  opts: SegmentDownloadOptions
): Promise<SegmentDownloadResult> {
  const headers = {
    ...EXTRACTOR_HEADERS,
    ...(opts.referer ? { Referer: opts.referer } : {}),
    ...opts.headers,
  };
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const segmentsDir = path.join(opts.jobDir, "segments");
  await fs.mkdir(segmentsDir, { recursive: true });
  const resumeManager = opts.resumeManager ?? new ResumeManager();
  const type = opts.type ?? "hls";

  let segments: SegmentCheckpoint[] = segmentUrls.map((url, index) => ({
    index,
    url,
    downloaded: false,
    path: path.join(segmentsDir, `${String(index).padStart(5, "0")}.ts`),
  }));

  const existing = await resumeManager.loadDisk(opts.jobDir);
  if (
    existing &&
    existing.type === type &&
    existing.segments &&
    existing.segments.length === segmentUrls.length
  ) {
    const validation = resumeManager.validate(existing, { url: playlistUrl });
    if (validation.ok) {
      segments = existing.segments.map((s, i) => ({
        ...s,
        url: segmentUrls[i] ?? s.url,
        path: s.path ?? path.join(segmentsDir, `${String(i).padStart(5, "0")}.ts`),
      }));
    }
  }

  const save = async () => {
    const downloadedBytes = segments
      .filter((s) => s.downloaded)
      .reduce((n, s) => n + (s.size ?? 0), 0);
    const cp: DownloadCheckpoint = {
      jobId: opts.jobId,
      url: playlistUrl,
      provider: opts.provider,
      type,
      downloadedBytes,
      totalBytes: undefined,
      segments: [...segments],
      updatedAt: Date.now(),
    };
    await resumeManager.save(opts.jobDir, cp);
    const done = segments.filter((s) => s.downloaded).length;
    opts.onProgress?.({
      downloaded: downloadedBytes,
      total: downloadedBytes,
      completedSegments: done,
      totalSegments: segments.length,
    });
  };

  await save();

  const pending = segments.filter((s) => !s.downloaded);
  await mapPool(pending, concurrency, async (seg: SegmentCheckpoint) => {
    const dest = seg.path!;
    // Skip if file already on disk
    try {
      const st = await fs.stat(dest);
      if (st.size > 0) {
        seg.downloaded = true;
        seg.size = st.size;
        await save();
        return;
      }
    } catch {
      /* download */
    }
    const size = await fetchSegment(seg.url, headers, dest, opts.signal);
    seg.downloaded = true;
    seg.size = size;
    await save();
  });

  const segmentPaths = segments
    .sort((a, b) => a.index - b.index)
    .map((s) => s.path!)
    .filter(Boolean);

  const downloadedBytes = segments.reduce((n, s) => n + (s.size ?? 0), 0);
  return { segments, segmentPaths, downloadedBytes };
}

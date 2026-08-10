import fs from "node:fs/promises";
import path from "node:path";
import { EXTRACTOR_HEADERS } from "../providers/extractors/http";
import { downloadSegments } from "../download/segment-downloader";
import type { ResumeManager } from "../download/resume/resume-manager";
import { resolveFfmpeg, requireFfmpegMessage } from "../providers/youtube/mux";
import { spawn } from "node:child_process";

export interface HlsExtractOptions {
  jobId: string;
  jobDir: string;
  outPath: string;
  referer?: string;
  headers?: Record<string, string>;
  concurrency?: number;
  signal?: AbortSignal;
  resumeManager?: ResumeManager;
  provider?: string;
  onProgress?: (info: {
    downloaded: number;
    total: number;
    completedSegments: number;
    totalSegments: number;
    phase: "download" | "processing";
  }) => void;
}

export interface ParsedHlsPlaylist {
  mediaPlaylistUrl: string;
  segmentUrls: string[];
  isMaster: boolean;
}

function resolveUrl(base: string, ref: string): string {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

/** Parse HLS master or media playlist; picks highest BANDWIDTH variant from master. */
export function parseM3u8(text: string, playlistUrl: string): ParsedHlsPlaylist {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const variants: Array<{ bandwidth: number; uri: string }> = [];
  const segments: string[] = [];
  let isMaster = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      isMaster = true;
      const bw = Number(line.match(/BANDWIDTH=(\d+)/i)?.[1] ?? 0);
      const next = lines[i + 1];
      if (next && !next.startsWith("#")) {
        variants.push({ bandwidth: bw, uri: resolveUrl(playlistUrl, next) });
        i++;
      }
    } else if (line.startsWith("#EXTINF:")) {
      const next = lines[i + 1];
      if (next && !next.startsWith("#")) {
        segments.push(resolveUrl(playlistUrl, next));
        i++;
      }
    } else if (!line.startsWith("#") && !isMaster) {
      // bare URI line in media playlist without EXTINF (rare)
      if (/\.(ts|m4s|mp4)(\?|$)/i.test(line)) {
        segments.push(resolveUrl(playlistUrl, line));
      }
    }
  }

  if (isMaster && variants.length) {
    variants.sort((a, b) => b.bandwidth - a.bandwidth);
    return {
      mediaPlaylistUrl: variants[0]!.uri,
      segmentUrls: [],
      isMaster: true,
    };
  }

  return {
    mediaPlaylistUrl: playlistUrl,
    segmentUrls: segments,
    isMaster: false,
  };
}

export async function fetchAndParseHls(
  m3u8Url: string,
  opts?: { headers?: Record<string, string>; referer?: string; signal?: AbortSignal }
): Promise<{ mediaPlaylistUrl: string; segmentUrls: string[] }> {
  const headers = {
    ...EXTRACTOR_HEADERS,
    ...(opts?.referer ? { Referer: opts.referer } : {}),
    ...opts?.headers,
  };

  const load = async (url: string) => {
    const res = await fetch(url, { headers, redirect: "follow", signal: opts?.signal });
    if (!res.ok) throw new Error(`Failed to fetch playlist (${res.status}): ${url}`);
    return parseM3u8(await res.text(), url);
  };

  let parsed = await load(m3u8Url);
  if (parsed.isMaster) {
    parsed = await load(parsed.mediaPlaylistUrl);
  }
  if (!parsed.segmentUrls.length) {
    throw new Error("HLS playlist has no segments");
  }
  return {
    mediaPlaylistUrl: parsed.mediaPlaylistUrl,
    segmentUrls: parsed.segmentUrls,
  };
}

async function runFfmpeg(bin: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim().split("\n").slice(-4).join(" ") || `ffmpeg exited ${code}`));
    });
  });
}

/** Concat local MPEG-TS segments into MP4 via ffmpeg (processing phase). */
export async function remuxSegmentFilesToMp4(
  segmentPaths: string[],
  outPath: string
): Promise<void> {
  const bin = await resolveFfmpeg();
  if (!bin) throw new Error(requireFfmpegMessage());
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const listPath = `${outPath}.concat.txt`;
  const body = segmentPaths
    .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(listPath, body, "utf8");
  try {
    await runFfmpeg(bin, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-bsf:a",
      "aac_adtstoasc",
      outPath,
    ]);
  } finally {
    await fs.unlink(listPath).catch(() => undefined);
  }
}

/**
 * Resumable HLS: download segments with checkpoints, then ffmpeg remux (processing).
 */
export async function downloadHlsResumable(
  m3u8Url: string,
  opts: HlsExtractOptions
): Promise<{ outPath: string; segmentCount: number }> {
  const { mediaPlaylistUrl, segmentUrls } = await fetchAndParseHls(m3u8Url, {
    headers: opts.headers,
    referer: opts.referer,
    signal: opts.signal,
  });

  const result = await downloadSegments(mediaPlaylistUrl, segmentUrls, {
    jobId: opts.jobId,
    jobDir: opts.jobDir,
    headers: opts.headers,
    referer: opts.referer,
    concurrency: opts.concurrency,
    signal: opts.signal,
    resumeManager: opts.resumeManager,
    provider: opts.provider,
    type: "hls",
    onProgress: (info) =>
      opts.onProgress?.({ ...info, phase: "download" }),
  });

  opts.onProgress?.({
    downloaded: result.downloadedBytes,
    total: result.downloadedBytes,
    completedSegments: result.segments.length,
    totalSegments: result.segments.length,
    phase: "processing",
  });

  await remuxSegmentFilesToMp4(result.segmentPaths, opts.outPath);
  await opts.resumeManager?.clear(opts.jobDir, opts.jobId);
  return { outPath: opts.outPath, segmentCount: result.segmentPaths.length };
}

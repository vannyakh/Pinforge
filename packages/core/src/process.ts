import fs from "node:fs/promises";
import path from "node:path";
import { runPipeline } from "./pipeline/runPipeline";
import type {
  DownloadResult,
  PresetName,
  ProcessOptions,
  ProcessResult,
  ProviderId,
  ResolvedMedia,
} from "./types";
import { DEFAULT_ENHANCE_FEATURES } from "./types";
import {
  detectProvider,
  isPinterestCollectionUrl,
  isYouTubeChannelUrl,
  isYouTubePlaylistUrl,
  resolveBoard,
  resolvePin,
  resolveYouTubeChannel,
  resolveYouTubePlaylist,
  type MediaProvider,
} from "./providers";
import { resolveYouTubeVideo } from "./providers/youtube/service";
import { sanitizeFilename, sleep } from "./utils";
import { mapPool } from "./download/pool";
import { DEFAULT_PINTEREST_OPTIONS, DEFAULT_YOUTUBE_OPTIONS } from "./types";
import { zipFolder } from "./zip/folderZip";

export interface ProcessBoardOptions extends ProcessOptions {
  onProgress?: (info: {
    current: number;
    total: number;
    url: string;
    result?: ProcessResult;
    error?: string;
    /** 0–100 when byte progress is known */
    percent?: number;
    downloaded?: number;
    totalBytes?: number | null;
    phase?: string;
    title?: string;
  }) => void;
}

async function writeResolved(
  media: ResolvedMedia,
  opts: ProcessOptions
): Promise<ProcessResult> {
  await fs.mkdir(opts.outDir, { recursive: true });

  const enhance = opts.enhance !== false && media.kind === "image" && media.buffer;
  const idPart = media.id ? sanitizeFilename(media.id) : "";
  const titlePart = sanitizeFilename(
    media.title?.trim() || (idPart ? media.provider : `${media.provider}-${Date.now()}`)
  );
  // Stable name when id known → resume / duplicate skip
  const base = idPart
    ? sanitizeFilename(`${titlePart}-${idPart}`.slice(0, 180))
    : titlePart;
  const stamp = idPart ? "" : `-${Date.now()}`;

  const exists = async (p: string) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  };

  if (enhance && media.buffer) {
    const features = {
      ...DEFAULT_ENHANCE_FEATURES,
      ...opts.features,
    };
    const enhanced = await runPipeline(media.buffer, {
      preset: opts.preset ?? "auto",
      features,
    });
    const enhancedPath = path.join(opts.outDir, `${base}${stamp}.${enhanced.ext}`);
    if (idPart && (await exists(enhancedPath))) {
      return {
        outPath: enhancedPath,
        sourceUrl: media.sourceUrl,
        title: media.title,
        provider: media.provider,
        kind: media.kind,
        skipped: true,
      };
    }
    let originalPath: string | undefined;
    if (features.keepOriginal !== false) {
      originalPath = path.join(opts.outDir, `${base}${stamp}-original.${media.ext}`);
      if (!(idPart && (await exists(originalPath)))) {
        await fs.writeFile(originalPath, media.buffer);
      }
    }
    await fs.writeFile(enhancedPath, enhanced.buffer);
    return {
      outPath: enhancedPath,
      originalPath,
      sourceUrl: media.sourceUrl,
      title: media.title,
      provider: media.provider,
      kind: media.kind,
    };
  }

  // Provider already wrote the final file (YouTube service, etc.)
  if (media.filePath) {
    const resolvedPath = path.resolve(media.filePath);
    const outRoot = path.resolve(opts.outDir);
    if (resolvedPath === outRoot || resolvedPath.startsWith(outRoot + path.sep)) {
      return {
        outPath: media.filePath,
        sourceUrl: media.sourceUrl,
        title: media.title,
        provider: media.provider,
        kind: media.kind,
      };
    }
    const dest = path.join(opts.outDir, `${base}${stamp}.${media.ext}`);
    if (idPart && (await exists(dest))) {
      return {
        outPath: dest,
        sourceUrl: media.sourceUrl,
        title: media.title,
        provider: media.provider,
        kind: media.kind,
        skipped: true,
      };
    }
    await fs.copyFile(media.filePath, dest);
    return {
      outPath: dest,
      sourceUrl: media.sourceUrl,
      title: media.title,
      provider: media.provider,
      kind: media.kind,
    };
  }

  const buffer = media.buffer ?? null;
  if (!buffer) throw new Error("Resolved media has no buffer or file path");

  const outPath = path.join(opts.outDir, `${base}${stamp}.${media.ext}`);
  if (idPart && (await exists(outPath))) {
    return {
      outPath,
      sourceUrl: media.sourceUrl,
      title: media.title,
      provider: media.provider,
      kind: media.kind,
      skipped: true,
    };
  }
  await fs.writeFile(outPath, buffer);
  return {
    outPath,
    sourceUrl: media.sourceUrl,
    title: media.title,
    provider: media.provider,
    kind: media.kind,
  };
}

type ItemOutcome =
  | { ok: true; index: number; result: ProcessResult; url: string }
  | { ok: false; index: number; error: string; url: string };

/**
 * Detect provider → resolve → save (enhance images when enabled).
 * Batch / board items run with limited concurrency; each file may use
 * multi-fragment Range downloads.
 */
export async function processMedia(
  url: string,
  opts: ProcessBoardOptions
): Promise<DownloadResult> {
  const provider = detectProvider(url);
  const itemConcurrency = Math.max(1, opts.itemConcurrency ?? 3);

  if (provider.id === "pinterest" && isPinterestCollectionUrl(url)) {
    return processPinterestBoard(url, opts, provider.id);
  }

  if (provider.id === "youtube" && isYouTubeChannelUrl(url)) {
    return processYouTubeChannel(url, opts);
  }

  if (provider.id === "youtube" && isYouTubePlaylistUrl(url)) {
    return processYouTubePlaylist(url, opts);
  }

  const resolved = await provider.resolve(url, {
    format: opts.format,
    outDir: opts.outDir,
    extractorUrl: opts.extractorUrl,
    fragmentConcurrency: opts.fragmentConcurrency ?? 4,
    signal: opts.signal,
    youtube: opts.youtube,
    onByteProgress: (p) => {
      const percent =
        p.total && p.total > 0
          ? Math.min(99, Math.round((p.downloaded / p.total) * 100))
          : undefined;
      opts.onProgress?.({
        current: 0,
        total: 1,
        url,
        percent,
        downloaded: p.downloaded,
        totalBytes: p.total,
        phase: p.phase ?? "download",
      });
    },
  });

  const list = Array.isArray(resolved) ? resolved : [resolved];
  if (list[0]?.title) {
    opts.onProgress?.({
      current: 0,
      total: list.length,
      url,
      title: list[0].title,
      phase: "resolved",
      percent: 0,
    });
  }
  const outcomes = await mapPool(list, itemConcurrency, async (item, i) => {
    try {
      const result = await writeResolved(item, opts);
      const outcome: ItemOutcome = { ok: true, index: i, result, url: item.sourceUrl };
      opts.onProgress?.({
        current: i + 1,
        total: list.length,
        url: item.sourceUrl,
        result,
      });
      return outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const outcome: ItemOutcome = { ok: false, index: i, error: message, url: item.sourceUrl };
      opts.onProgress?.({
        current: i + 1,
        total: list.length,
        url: item.sourceUrl,
        error: message,
      });
      return outcome;
    }
  });

  const results: ProcessResult[] = [];
  const errors: { url: string; error: string }[] = [];
  for (const o of outcomes) {
    if (o.ok) results.push(o.result);
    else errors.push({ url: o.url, error: o.error });
  }

  return {
    results,
    errors,
    provider: provider.id,
    kind: list.length > 1 ? "batch" : "single",
  };
}

async function processPinterestBoard(
  url: string,
  opts: ProcessBoardOptions,
  providerId: ProviderId
): Promise<DownloadResult> {
  const pinOpts = { ...DEFAULT_PINTEREST_OPTIONS, ...opts.pinterest };
  const maxPins = Math.max(
    1,
    Math.min(2000, pinOpts.boardMaxPins ?? DEFAULT_PINTEREST_OPTIONS.boardMaxPins)
  );
  const { pinUrls, pins, boardName, kind } = await resolveBoard(url, {
    maxPins,
    signal: opts.signal,
  });
  const delayMs = opts.delayMs ?? 400;
  const itemConcurrency = Math.max(1, opts.itemConcurrency ?? 3);
  const folderLabel =
    boardName ||
    (kind === "profile" ? "pinterest-profile" : kind === "search" ? "pinterest-search" : "pinterest-board");
  const outDir = path.join(opts.outDir, sanitizeFilename(folderLabel));

  const pinMeta = new Map((pins ?? []).map((p) => [p.url, p]));

  const outcomes = await mapPool(pinUrls, itemConcurrency, async (pinUrl, i) => {
    if (i > 0 && delayMs > 0) await sleep(Math.min(delayMs, 250));
    try {
      const meta = pinMeta.get(pinUrl);
      const asset = await resolvePin(pinUrl);
      const result = await writeResolved(
        {
          kind: asset.kind ?? "image",
          buffer: asset.buffer,
          ext: asset.ext,
          sourceUrl: asset.sourceUrl,
          title: asset.title || meta?.title,
          provider: providerId,
          id: asset.pinId || meta?.pinId,
        },
        { ...opts, outDir }
      );
      opts.onProgress?.({
        current: i + 1,
        total: pinUrls.length,
        url: pinUrl,
        result,
        title: asset.title || meta?.title,
      });
      return { ok: true as const, index: i, result, url: pinUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.onProgress?.({
        current: i + 1,
        total: pinUrls.length,
        url: pinUrl,
        error: message,
      });
      return { ok: false as const, index: i, error: message, url: pinUrl };
    }
  });

  const results: ProcessResult[] = [];
  const errors: { url: string; error: string }[] = [];
  for (const o of outcomes) {
    if (o.ok) results.push(o.result);
    else errors.push({ url: o.url, error: o.error });
  }

  let zipPath: string | undefined;
  if (pinOpts.zipBoards && results.length > 0) {
    try {
      opts.onProgress?.({
        current: pinUrls.length,
        total: pinUrls.length,
        url,
        phase: "zip",
        title: boardName,
      });
      zipPath = await zipFolder(outDir);
    } catch {
      /* zip is best-effort */
    }
  }

  return { results, errors, provider: providerId, kind: "batch", zipPath };
}

async function processYouTubeChannel(
  url: string,
  opts: ProcessBoardOptions
): Promise<DownloadResult> {
  const ytOpts = { ...DEFAULT_YOUTUBE_OPTIONS, ...opts.youtube };
  const maxVideos = ytOpts.channelMaxVideos ?? DEFAULT_YOUTUBE_OPTIONS.channelMaxVideos;
  const channel = await resolveYouTubeChannel(url, {
    maxVideos,
    signal: opts.signal,
  });

  if (channel.videos.length === 0) {
    throw new Error(
      channel.channelTitle
        ? `No videos found on channel “${channel.channelTitle}”.`
        : "No videos found on this YouTube channel."
    );
  }

  opts.onProgress?.({
    current: 0,
    total: channel.videos.length,
    url,
    title: channel.channelTitle,
    phase: "resolved",
    percent: 0,
  });

  const delayMs = opts.delayMs ?? 400;
  const itemConcurrency = Math.max(1, Math.min(2, opts.itemConcurrency ?? 2));
  const outDir =
    ytOpts.organizeByChannel && channel.channelTitle
      ? path.join(opts.outDir, sanitizeFilename(channel.channelTitle))
      : opts.outDir;

  const outcomes = await mapPool(channel.videos, itemConcurrency, async (video, i) => {
    if (i > 0 && delayMs > 0) await sleep(Math.min(delayMs, 400));
    opts.signal?.throwIfAborted?.();
    try {
      const media = await resolveYouTubeVideo(video.url, {
        format: opts.format ?? "best",
        youtube: opts.youtube,
        outDir,
        extractorUrl: opts.extractorUrl,
        fragmentConcurrency: opts.fragmentConcurrency ?? 4,
        signal: opts.signal,
        onByteProgress: (p) => {
          const percent =
            p.total && p.total > 0
              ? Math.min(99, Math.round((p.downloaded / p.total) * 100))
              : undefined;
          opts.onProgress?.({
            current: i,
            total: channel.videos.length,
            url: video.url,
            title: video.title ?? channel.channelTitle,
            percent,
            downloaded: p.downloaded,
            totalBytes: p.total,
            phase: p.phase ?? "download",
          });
        },
      });
      const result = await writeResolved(media, { ...opts, outDir });
      opts.onProgress?.({
        current: i + 1,
        total: channel.videos.length,
        url: video.url,
        title: result.title ?? video.title,
        result,
        percent: Math.round(((i + 1) / channel.videos.length) * 100),
      });
      return { ok: true as const, index: i, result, url: video.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.onProgress?.({
        current: i + 1,
        total: channel.videos.length,
        url: video.url,
        error: message,
      });
      return { ok: false as const, index: i, error: message, url: video.url };
    }
  });

  const results: ProcessResult[] = [];
  const errors: { url: string; error: string }[] = [];
  for (const o of outcomes) {
    if (o.ok) results.push(o.result);
    else errors.push({ url: o.url, error: o.error });
  }

  return { results, errors, provider: "youtube", kind: "batch" };
}

async function processYouTubePlaylist(
  url: string,
  opts: ProcessBoardOptions
): Promise<DownloadResult> {
  const ytOpts = { ...DEFAULT_YOUTUBE_OPTIONS, ...opts.youtube };
  const maxVideos = ytOpts.playlistMaxVideos ?? DEFAULT_YOUTUBE_OPTIONS.playlistMaxVideos;
  const playlist = await resolveYouTubePlaylist(url, {
    maxVideos,
    signal: opts.signal,
  });

  if (playlist.videos.length === 0) {
    throw new Error(
      playlist.playlistTitle
        ? `No videos found in playlist “${playlist.playlistTitle}”.`
        : "No videos found in this YouTube playlist."
    );
  }

  opts.onProgress?.({
    current: 0,
    total: playlist.videos.length,
    url,
    title: playlist.playlistTitle,
    phase: "resolved",
    percent: 0,
  });

  const delayMs = opts.delayMs ?? 400;
  const itemConcurrency = Math.max(1, Math.min(2, opts.itemConcurrency ?? 2));
  const outDir =
    ytOpts.organizeByChannel && playlist.playlistTitle
      ? path.join(opts.outDir, sanitizeFilename(playlist.playlistTitle))
      : opts.outDir;

  const outcomes = await mapPool(playlist.videos, itemConcurrency, async (video, i) => {
    if (i > 0 && delayMs > 0) await sleep(Math.min(delayMs, 400));
    opts.signal?.throwIfAborted?.();
    try {
      const media = await resolveYouTubeVideo(video.url, {
        format: opts.format ?? "best",
        youtube: opts.youtube,
        outDir,
        extractorUrl: opts.extractorUrl,
        fragmentConcurrency: opts.fragmentConcurrency ?? 4,
        signal: opts.signal,
        onByteProgress: (p) => {
          const percent =
            p.total && p.total > 0
              ? Math.min(99, Math.round((p.downloaded / p.total) * 100))
              : undefined;
          opts.onProgress?.({
            current: i,
            total: playlist.videos.length,
            url: video.url,
            title: video.title ?? playlist.playlistTitle,
            percent,
            downloaded: p.downloaded,
            totalBytes: p.total,
            phase: p.phase ?? "download",
          });
        },
      });
      const result = await writeResolved(media, { ...opts, outDir });
      opts.onProgress?.({
        current: i + 1,
        total: playlist.videos.length,
        url: video.url,
        title: result.title ?? video.title,
        result,
        percent: Math.round(((i + 1) / playlist.videos.length) * 100),
      });
      return { ok: true as const, index: i, result, url: video.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.onProgress?.({
        current: i + 1,
        total: playlist.videos.length,
        url: video.url,
        error: message,
      });
      return { ok: false as const, index: i, error: message, url: video.url };
    }
  });

  const results: ProcessResult[] = [];
  const errors: { url: string; error: string }[] = [];
  for (const o of outcomes) {
    if (o.ok) results.push(o.result);
    else errors.push({ url: o.url, error: o.error });
  }

  return { results, errors, provider: "youtube", kind: "batch" };
}

/** @deprecated Prefer processMedia — kept for desktop IPC compatibility. */
export async function processPin(
  url: string,
  opts: ProcessOptions
): Promise<ProcessResult> {
  const { results, errors } = await processMedia(url, opts);
  if (results[0]) return results[0];
  throw new Error(errors[0]?.error ?? "Download failed");
}

/** @deprecated Prefer processMedia */
export async function processBoard(
  url: string,
  opts: ProcessBoardOptions
): Promise<{ results: ProcessResult[]; errors: { url: string; error: string }[] }> {
  const res = await processMedia(url, opts);
  return { results: res.results, errors: res.errors };
}

export async function processUrl(
  url: string,
  opts: ProcessBoardOptions
): Promise<{
  kind: "pin" | "board";
  results: ProcessResult[];
  errors: { url: string; error: string }[];
}> {
  const res = await processMedia(url, opts);
  return {
    kind: res.kind === "batch" ? "board" : "pin",
    results: res.results,
    errors: res.errors,
  };
}

export function detectMediaProvider(url: string): MediaProvider {
  return detectProvider(url);
}

export type { PresetName, ProcessOptions, ProcessResult };

import fs from "node:fs/promises";
import path from "node:path";
import { runPipeline } from "@pinforge/enhance";
import type {
  DownloadResult,
  PresetName,
  ProcessBoardOptions,
  ProcessOptions,
  ProcessResult,
  ProviderId,
  ResolvedMedia,
} from "@pinforge/types";
import {
  DEFAULT_ENHANCE_FEATURES,
  DEFAULT_PINTEREST_OPTIONS,
  DEFAULT_YOUTUBE_OPTIONS,
} from "@pinforge/types";
import {
  detectProvider,
  isPinterestCollectionUrl,
  isPinItHost,
  expandPinterestUrl,
  isYouTubeChannelUrl,
  isYouTubePlaylistUrl,
  isTikTokProfileUrl,
  resolveBoard,
  resolvePin,
  resolveYouTubeChannel,
  resolveYouTubePlaylist,
  resolveTikTokProfile,
  extractTikTok,
  fragmentConcurrencyForQuality,
  qualityFromFormat,
  type MediaProvider,
} from "@pinforge/providers";
import { resolveYouTubeVideo } from "@pinforge/providers/youtube/service";
import { packFolderName, resolveMediaFileBase, sanitizeFilename, sleep } from "@pinforge/types";
import type { NamingTemplates } from "@pinforge/types";
import { mapPool } from "@pinforge/download";
import { zipFolder } from "./zip/folderZip";

export type { ProcessBoardOptions };

function resolveFragmentConcurrency(opts: ProcessBoardOptions): number {
  if (typeof opts.fragmentConcurrency === "number" && opts.fragmentConcurrency > 0) {
    return opts.fragmentConcurrency;
  }
  const quality = qualityFromFormat(opts.format ?? "best", opts.youtube?.quality);
  return fragmentConcurrencyForQuality(quality);
}

async function writeResolved(media: ResolvedMedia, opts: ProcessOptions): Promise<ProcessResult> {
  await fs.mkdir(opts.outDir, { recursive: true });

  const downloadMeta = {
    height: media.height,
    format: opts.format,
    youtubeQuality: opts.youtube?.quality,
  };

  const enhance = opts.enhance !== false && media.kind === "image" && media.buffer;
  const idPart = media.id ? sanitizeFilename(media.id) : "";
  const stamp = idPart ? "" : `-${Date.now()}`;
  const base = resolveMediaFileBase(media, {
    naming: opts.naming,
    quality: opts.youtube?.quality,
    stamp,
  });

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
        ...downloadMeta,
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
      ...downloadMeta,
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
        ...downloadMeta,
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
        ...downloadMeta,
      };
    }
    await fs.copyFile(media.filePath, dest);
    return {
      outPath: dest,
      sourceUrl: media.sourceUrl,
      title: media.title,
      provider: media.provider,
      kind: media.kind,
      ...downloadMeta,
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
      ...downloadMeta,
    };
  }
  await fs.writeFile(outPath, buffer);
  return {
    outPath,
    sourceUrl: media.sourceUrl,
    title: media.title,
    provider: media.provider,
    kind: media.kind,
    ...downloadMeta,
  };
}

type ItemOutcome =
  | { ok: true; index: number; result: ProcessResult; url: string }
  | { ok: false; index: number; error: string; url: string };

function isUnder(filePath: string, root: string): boolean {
  const target = path.resolve(filePath);
  const base = path.resolve(root);
  return target === base || target.startsWith(base + path.sep);
}

/**
 * Where the files of one download should land: a dedicated folder when the
 * download yields several files, otherwise the shared output directory.
 * Files a provider already wrote into `outDir` stay put — moving them would
 * duplicate what is on disk.
 */
export function outDirForItems(
  outDir: string,
  items: { title?: string; id?: string; provider?: string; filePath?: string }[],
  packFolders?: boolean,
  naming?: NamingTemplates
): string {
  if (packFolders === false || items.length < 2) return outDir;
  if (items.some((item) => item.filePath && isUnder(item.filePath, outDir))) return outDir;
  const first = items[0];
  if (!first) return outDir;
  return path.join(
    outDir,
    packFolderName(
      { title: first.title, id: first.id, provider: first.provider },
      naming?.folderName
    )
  );
}

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

  let processUrl = url;
  if (provider.id === "pinterest") {
    try {
      const host = new URL(url.trim().includes("://") ? url.trim() : `https://${url.trim()}`)
        .hostname;
      if (isPinItHost(host)) {
        processUrl = await expandPinterestUrl(url);
      }
    } catch {
      /* keep original url */
    }
  }

  if (provider.id === "pinterest" && isPinterestCollectionUrl(processUrl)) {
    return processPinterestBoard(processUrl, opts, provider.id);
  }

  if (provider.id === "youtube" && isYouTubeChannelUrl(url)) {
    return processYouTubeChannel(url, opts);
  }

  if (provider.id === "youtube" && isYouTubePlaylistUrl(url)) {
    return processYouTubePlaylist(url, opts);
  }

  if (provider.id === "tiktok" && isTikTokProfileUrl(url)) {
    return processTikTokProfile(url, opts);
  }

  const resolved = await provider.resolve(processUrl, {
    format: opts.format,
    outDir: opts.outDir,
    extractorUrl: opts.extractorUrl,
    fragmentConcurrency: resolveFragmentConcurrency(opts),
    signal: opts.signal,
    youtube: opts.youtube,
    packFolders: opts.packFolders,
    naming: opts.naming,
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
  const outDir = outDirForItems(opts.outDir, list, opts.packFolders, opts.naming);
  const itemOpts = outDir === opts.outDir ? opts : { ...opts, outDir };
  const outcomes = await mapPool(list, itemConcurrency, async (item, i) => {
    try {
      const result = await writeResolved(item, itemOpts);
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
    (kind === "profile"
      ? "pinterest-profile"
      : kind === "search"
        ? "pinterest-search"
        : "pinterest-board");
  const outDir = path.join(opts.outDir, sanitizeFilename(folderLabel));

  const pinMeta = new Map((pins ?? []).map((p) => [p.url, p]));

  const outcomes = await mapPool(pinUrls, itemConcurrency, async (pinUrl, i) => {
    if (i > 0 && delayMs > 0) await sleep(Math.min(delayMs, 250));
    try {
      const meta = pinMeta.get(pinUrl);
      const assetOrList = await resolvePin(pinUrl);
      const assets = Array.isArray(assetOrList) ? assetOrList : [assetOrList];
      const media = assets.map((asset) => ({
        kind: asset.kind ?? ("image" as const),
        buffer: asset.buffer,
        ext: asset.ext,
        sourceUrl: asset.sourceUrl,
        title: asset.title || meta?.title,
        provider: providerId,
        id: asset.pinId || meta?.pinId,
      }));
      const pinDir = outDirForItems(outDir, media, opts.packFolders, opts.naming);
      const written = [];
      for (const item of media) {
        written.push(await writeResolved(item, { ...opts, outDir: pinDir }));
      }
      const result = written[written.length - 1]!;
      opts.onProgress?.({
        current: i + 1,
        total: pinUrls.length,
        url: pinUrl,
        result,
        title: assets[0]?.title || meta?.title,
      });
      return { ok: true as const, index: i, result, results: written, url: pinUrl };
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
    if (o.ok) results.push(...(o.results?.length ? o.results : [o.result]));
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
        fragmentConcurrency: resolveFragmentConcurrency(opts),
        packFolders: opts.packFolders,
    naming: opts.naming,
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
        fragmentConcurrency: resolveFragmentConcurrency(opts),
        packFolders: opts.packFolders,
    naming: opts.naming,
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

async function processTikTokProfile(
  url: string,
  opts: ProcessBoardOptions
): Promise<DownloadResult> {
  const maxVideos = opts.youtube?.channelMaxVideos ?? DEFAULT_YOUTUBE_OPTIONS.channelMaxVideos;
  const profile = await resolveTikTokProfile(url, {
    maxVideos,
    signal: opts.signal,
  });

  if (profile.videos.length === 0) {
    throw new Error(
      profile.displayName
        ? `No videos found on ${profile.displayName}.`
        : "No videos found on this TikTok profile."
    );
  }

  opts.onProgress?.({
    current: 0,
    total: profile.videos.length,
    url,
    title: profile.displayName,
    phase: "resolved",
    percent: 0,
  });

  const delayMs = opts.delayMs ?? 400;
  const itemConcurrency = Math.max(1, Math.min(2, opts.itemConcurrency ?? 2));
  const outDir = profile.username
    ? path.join(opts.outDir, sanitizeFilename(`tiktok-${profile.username}`))
    : opts.outDir;

  const outcomes = await mapPool(profile.videos, itemConcurrency, async (video, i) => {
    if (i > 0 && delayMs > 0) await sleep(Math.min(delayMs, 400));
    opts.signal?.throwIfAborted?.();
    try {
      const mediaOrList = await extractTikTok(video.url, opts.format ?? "best", {
        fragmentConcurrency: resolveFragmentConcurrency(opts),
        signal: opts.signal,
      });
      const list = Array.isArray(mediaOrList) ? mediaOrList : [mediaOrList];
      const postDir = outDirForItems(outDir, list, opts.packFolders, opts.naming);
      const written: ProcessResult[] = [];
      for (const media of list) {
        written.push(await writeResolved(media, { ...opts, outDir: postDir }));
      }
      const result = written[written.length - 1]!;
      opts.onProgress?.({
        current: i + 1,
        total: profile.videos.length,
        url: video.url,
        title: result.title ?? video.title,
        result,
        percent: Math.round(((i + 1) / profile.videos.length) * 100),
      });
      return { ok: true as const, index: i, result, results: written, url: video.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.onProgress?.({
        current: i + 1,
        total: profile.videos.length,
        url: video.url,
        error: message,
      });
      return { ok: false as const, index: i, error: message, url: video.url };
    }
  });

  const results: ProcessResult[] = [];
  const errors: { url: string; error: string }[] = [];
  for (const o of outcomes) {
    if (o.ok) results.push(...(o.results?.length ? o.results : [o.result]));
    else errors.push({ url: o.url, error: o.error });
  }

  return { results, errors, provider: "tiktok", kind: "batch" };
}

/** @deprecated Prefer processMedia — kept for desktop IPC compatibility. */
export async function processPin(url: string, opts: ProcessOptions): Promise<ProcessResult> {
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

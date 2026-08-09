import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_YOUTUBE_OPTIONS,
  type FormatPreset,
  type ResolvedMedia,
  type YoutubeDownloadOptions,
} from "../../types";
import { downloadToFile } from "../../download/fragment";
import { sanitizeFilename } from "../../utils";
import { fetchBinary, toResolved } from "../extractors/http";
import { extractYouTubeId } from "../extractors/youtube";
import {
  audioOutputExt,
  extFromMime,
  pickAudioOnly,
  pickDashPair,
  pickProgressive,
  qualityFromFormat,
  type YtStreamFormat,
} from "./formats";
import {
  convertAudio,
  embedMetadata,
  muxAv,
  requireFfmpegMessage,
  resolveFfmpeg,
} from "./mux";
import { clearResumeState } from "./resume";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let innertubeMod: any = null;

async function getInnertube() {
  if (!innertubeMod) {
    innertubeMod = await import("youtubei.js");
  }
  return innertubeMod as typeof import("youtubei.js");
}

export type YoutubeResolveOpts = {
  format?: FormatPreset;
  youtube?: YoutubeDownloadOptions;
  outDir?: string;
  fragmentConcurrency?: number;
  signal?: AbortSignal;
  /** Legacy Piped/Invidious fallback base. */
  extractorUrl?: string;
  onByteProgress?: (info: {
    downloaded: number;
    total: number | null;
    phase?: string;
  }) => void;
};

type CaptionTrack = {
  language_code?: string;
  name?: { text?: string } | string;
  base_url?: string;
  url?: string;
};

type VideoMeta = {
  id: string;
  title: string;
  channel?: string;
  description?: string;
  uploadDate?: string;
  thumbnailUrl?: string;
  formats: YtStreamFormat[];
  captions: CaptionTrack[];
};

async function resolveInnertubeMeta(id: string): Promise<VideoMeta> {
  const { Innertube, ClientType, UniversalCache } = await getInnertube();
  const clients = ["ANDROID", "ANDROID_VR", "IOS"] as const;
  let lastError: Error | null = null;

  for (const client of clients) {
    try {
      const yt = await Innertube.create({
        cache: new UniversalCache(false),
        client_type: ClientType[client],
      });
      const info = await yt.getBasicInfo(id, { client });
      // youtubei.js shapes vary by client — keep access loose
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const basic: any = info.basic_info ?? {};
      const formats: YtStreamFormat[] = [
        ...(info.streaming_data?.formats ?? []),
        ...(info.streaming_data?.adaptive_formats ?? []),
      ]
        .map((f: YtStreamFormat & { quality?: string }) => ({
          ...f,
          quality_label: f.quality_label ?? f.quality,
        }))
        .filter((f: YtStreamFormat) => Boolean(f.url));

      if (!formats.length) {
        throw new Error(`No direct stream URLs (${String(client)})`);
      }

      const thumbs = basic.thumbnail ?? basic.thumbnails;
      let thumbnailUrl: string | undefined;
      if (Array.isArray(thumbs) && thumbs.length) {
        thumbnailUrl = thumbs[thumbs.length - 1]?.url;
      }

      const captions: CaptionTrack[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const captionBag: any = info.captions ?? {};
      const captionTracks = captionBag.caption_tracks ?? captionBag.captionTracks ?? [];
      if (Array.isArray(captionTracks)) {
        for (const t of captionTracks) {
          captions.push({
            language_code: t.language_code ?? t.languageCode,
            name: t.name,
            base_url: t.base_url ?? t.baseUrl,
            url: t.url,
          });
        }
      }

      return {
        id,
        title: basic.title ?? id,
        channel: basic.author ?? basic.channel?.name ?? basic.author_name,
        description: typeof basic.short_description === "string" ? basic.short_description : undefined,
        uploadDate: basic.start_timestamp
          ? String(basic.start_timestamp).slice(0, 10)
          : undefined,
        thumbnailUrl,
        formats,
        captions,
      };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Innertube extraction failed");
}

async function downloadUrlToFile(
  url: string,
  destPath: string,
  opts: {
    concurrency?: number;
    signal?: AbortSignal;
    resume?: boolean;
    accept?: string;
    onProgress?: (info: { downloaded: number; total: number | null }) => void;
  }
): Promise<void> {
  await downloadToFile(url, destPath, {
    referer: "https://www.youtube.com/",
    accept: opts.accept ?? "*/*",
    concurrency: opts.concurrency ?? 4,
    signal: opts.signal,
    resume: opts.resume !== false,
    onProgress: opts.onProgress,
  });
  if (opts.resume !== false) await clearResumeState(destPath);
}

async function writeCaptionFile(
  track: CaptionTrack,
  destBase: string,
  signal?: AbortSignal
): Promise<string | null> {
  const url = track.base_url || track.url;
  if (!url) return null;
  const sep = url.includes("?") ? "&" : "?";
  const vttUrl = /fmt=/i.test(url) ? url : `${url}${sep}fmt=vtt`;
  const res = await fetch(vttUrl, {
    headers: { Referer: "https://www.youtube.com/", "User-Agent": "Pinforge/0.1" },
    signal,
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.trim()) return null;
  const lang = track.language_code || "und";
  const out = `${destBase}.${lang}.vtt`;
  await fs.writeFile(out, text, "utf8");
  return out;
}

function pickCaption(tracks: CaptionTrack[], lang: string): CaptionTrack | undefined {
  const want = lang.toLowerCase();
  return (
    tracks.find((t) => (t.language_code ?? "").toLowerCase() === want) ??
    tracks.find((t) => (t.language_code ?? "").toLowerCase().startsWith(want)) ??
    tracks[0]
  );
}

/**
 * Pinforge YouTube single-video service (Innertube).
 * Writes to disk when `outDir` is set (preferred for DASH/ffmpeg); else returns buffer.
 */
export async function resolveYouTubeVideo(
  url: string,
  opts: YoutubeResolveOpts = {}
): Promise<ResolvedMedia> {
  const id = await extractYouTubeId(url);
  if (!id) throw new Error("Could not parse YouTube video id from URL");

  const format = opts.format ?? "best";
  const ytOpts = { ...DEFAULT_YOUTUBE_OPTIONS, ...opts.youtube };
  const quality = qualityFromFormat(format, ytOpts.quality);
  const audioOnly = format === "audio-only";

  let meta: VideoMeta;
  try {
    meta = await resolveInnertubeMeta(id);
    } catch {
      // Fall back to legacy extractor chain (Piped / ytdl)
      const { extractYouTubeViaPiped } = await import("../extractors/youtube");
      return extractYouTubeViaPiped(url, {
        format,
        extractorUrl: opts.extractorUrl,
        fragmentConcurrency: opts.fragmentConcurrency,
        signal: opts.signal,
      });
    }

  const workRoot =
    opts.outDir ??
    path.join(os.tmpdir(), "pinforge-yt", id, String(Date.now()));
  await fs.mkdir(workRoot, { recursive: true });

  const channelDir =
    ytOpts.organizeByChannel && meta.channel && opts.outDir
      ? path.join(opts.outDir, sanitizeFilename(meta.channel))
      : opts.outDir ?? workRoot;
  if (opts.outDir) await fs.mkdir(channelDir, { recursive: true });

  const stamp = Date.now();
  const baseName = sanitizeFilename(meta.title);
  const tmpDir = path.join(workRoot, `.tmp-${stamp}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const headersAcceptVideo = "video/mp4,video/webm,video/*,*/*;q=0.8";
  const headersAcceptAudio = "audio/*,*/*;q=0.8";
  const concurrency = opts.fragmentConcurrency ?? 4;
  const resume = ytOpts.resume;
  const onProg = opts.onByteProgress;

  let mediaPath: string;
  let outExt: string;
  let kind: "video" | "audio" = audioOnly ? "audio" : "video";

  onProg?.({ downloaded: 0, total: null, phase: "meta" });

  try {
    if (audioOnly) {
      const audio = pickAudioOnly(meta.formats);
      if (!audio?.url) throw new Error("No audio stream available");
      const srcExt = extFromMime(audio.mime_type) || "m4a";
      const rawPath = path.join(tmpDir, `audio.${srcExt}`);
      await downloadUrlToFile(audio.url, rawPath, {
        concurrency,
        signal: opts.signal,
        resume,
        accept: headersAcceptAudio,
        onProgress: onProg,
      });

      const want = ytOpts.audioContainer;
      outExt = audioOutputExt(want);
      mediaPath = path.join(tmpDir, `out.${outExt}`);
      if (want === "m4a" && (srcExt === "m4a" || srcExt === "mp4")) {
        await fs.copyFile(rawPath, mediaPath);
      } else {
        const ff = await resolveFfmpeg();
        if (!ff) throw new Error(requireFfmpegMessage());
        onProg?.({ downloaded: 0, total: null, phase: "convert" });
        await convertAudio(rawPath, mediaPath, want);
      }
    } else {
      const dash = pickDashPair(meta.formats, quality);
      const ff = await resolveFfmpeg();

      if (dash?.video.url && dash.audio.url && ff) {
        const vExt = extFromMime(dash.video.mime_type) || "mp4";
        const aExt = extFromMime(dash.audio.mime_type) || "m4a";
        const vPath = path.join(tmpDir, `video.${vExt}`);
        const aPath = path.join(tmpDir, `audio.${aExt}`);
        let vTotal: number | null = null;
        let aTotal: number | null = null;
        let vDone = 0;
        let aDone = 0;
        const emitDash = () => {
          const total =
            vTotal != null && aTotal != null ? vTotal + aTotal : vTotal != null ? vTotal * 1.25 : null;
          const downloaded = vDone + aDone;
          onProg?.({ downloaded, total, phase: "download" });
        };
        await downloadUrlToFile(dash.video.url, vPath, {
          concurrency,
          signal: opts.signal,
          resume,
          accept: headersAcceptVideo,
          onProgress: (p) => {
            vDone = p.downloaded;
            vTotal = p.total;
            emitDash();
          },
        });
        await downloadUrlToFile(dash.audio.url, aPath, {
          concurrency,
          signal: opts.signal,
          resume,
          accept: headersAcceptAudio,
          onProgress: (p) => {
            aDone = p.downloaded;
            aTotal = p.total;
            emitDash();
          },
        });
        outExt = vExt === "webm" && aExt === "webm" ? "webm" : "mp4";
        mediaPath = path.join(tmpDir, `merged.${outExt}`);
        onProg?.({
          downloaded: (vTotal ?? vDone) + (aTotal ?? aDone),
          total: (vTotal ?? vDone) + (aTotal ?? aDone),
          phase: "mux",
        });
        await muxAv(vPath, aPath, mediaPath);
      } else {
        const progressive = pickProgressive(meta.formats, quality);
        if (!progressive?.url) {
          if (dash && !ff) throw new Error(requireFfmpegMessage());
          throw new Error("No matching video stream");
        }
        outExt = extFromMime(progressive.mime_type) || "mp4";
        mediaPath = path.join(tmpDir, `progressive.${outExt}`);
        await downloadUrlToFile(progressive.url, mediaPath, {
          concurrency,
          signal: opts.signal,
          resume,
          accept: headersAcceptVideo,
          onProgress: onProg,
        });
      }
    }

    const subtitlePaths: string[] = [];
    let embedSub: string | undefined;
    if (ytOpts.subtitles !== "none" && meta.captions.length) {
      const track = pickCaption(meta.captions, ytOpts.subtitleLang);
      if (track) {
        const capBase = path.join(tmpDir, baseName);
        const capPath = await writeCaptionFile(track, capBase, opts.signal);
        if (capPath) {
          if (ytOpts.subtitles === "embed") embedSub = capPath;
          else subtitlePaths.push(capPath);
        }
      }
    }

    let thumbPath: string | undefined;
    if (ytOpts.tagMetadata && meta.thumbnailUrl) {
      try {
        const { buffer, ext } = await fetchBinary(meta.thumbnailUrl, {
          referer: "https://www.youtube.com/",
          concurrency: 1,
          signal: opts.signal,
        });
        thumbPath = path.join(tmpDir, `thumb.${ext || "jpg"}`);
        await fs.writeFile(thumbPath, buffer);
      } catch {
        thumbPath = undefined;
      }
    }

    const finalDir = channelDir;
    await fs.mkdir(finalDir, { recursive: true });
    let finalPath = path.join(finalDir, `${baseName}-${stamp}.${outExt}`);

    const needsTag =
      ytOpts.tagMetadata ||
      (ytOpts.subtitles === "embed" && Boolean(embedSub));
    const ff = await resolveFfmpeg();

    if (needsTag && ff && !audioOnly) {
      const tagged = path.join(tmpDir, `tagged.${outExt}`);
      try {
        await embedMetadata({
          inputPath: mediaPath,
          outPath: tagged,
          title: meta.title,
          artist: meta.channel,
          description: meta.description,
          date: meta.uploadDate,
          thumbnailPath: thumbPath,
          subtitlePath: embedSub,
        });
        mediaPath = tagged;
      } catch {
        /* keep untagged */
      }
    } else if (needsTag && ff && audioOnly) {
      const tagged = path.join(tmpDir, `tagged.${outExt}`);
      try {
        await embedMetadata({
          inputPath: mediaPath,
          outPath: tagged,
          title: meta.title,
          artist: meta.channel,
          description: meta.description,
          date: meta.uploadDate,
          thumbnailPath: thumbPath,
        });
        mediaPath = tagged;
      } catch {
        /* keep untagged */
      }
    }

    await fs.copyFile(mediaPath, finalPath);

    const savedSubs: string[] = [];
    for (const sub of subtitlePaths) {
      const dest = path.join(finalDir, path.basename(sub).replace(baseName, `${baseName}-${stamp}`));
      await fs.copyFile(sub, dest);
      savedSubs.push(dest);
    }

    // Cleanup tmp
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);

    if (!opts.outDir) {
      const buffer = await fs.readFile(finalPath);
      await fs.rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
      return {
        ...toResolved("youtube", url, buffer, outExt, meta.title, format),
        channel: meta.channel,
        subtitlePaths: savedSubs,
      };
    }

    return {
      kind,
      filePath: finalPath,
      ext: outExt,
      sourceUrl: url,
      title: meta.title,
      provider: "youtube",
      channel: meta.channel,
      subtitlePaths: savedSubs,
    };
  } catch (e) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }
}

/** Re-export for callers that only need progressive buffer without outDir. */
export async function resolveYouTubeBuffer(
  url: string,
  opts: YoutubeResolveOpts = {}
): Promise<ResolvedMedia> {
  return resolveYouTubeVideo(url, { ...opts, outDir: undefined });
}

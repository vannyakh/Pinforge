import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_YOUTUBE_OPTIONS,
  type FormatPreset,
  type ResolvedMedia,
  type YoutubeDownloadOptions,
} from "@pinforge/types";
import { sanitizeFilename } from "@pinforge/types";
import { fetchBinary, toResolved } from "@pinforge/download";
import { extractYouTubeId } from "../extract";
import {
  audioOutputExt,
  extFromMime,
  heightFromLabel,
  pickAudioOnly,
  pickDashPair,
  pickProgressive,
  qualityFromFormat,
  fragmentConcurrencyForQuality,
  qualityCap,
} from "../formats";
import {
  convertAudio,
  embedMetadata,
  muxAv,
  requireFfmpegMessage,
  resolveFfmpeg,
} from "../../../media/mux";
import { downloadUrlToFile, pickCaption, writeCaptionFile } from "./download";
import { resolveInnertubeMeta, type VideoMeta } from "./meta";

export { previewYouTubeVideo } from "./meta";
export type { YoutubeVideoPreview } from "./meta";

export type YoutubeResolveOpts = {
  format?: FormatPreset;
  youtube?: YoutubeDownloadOptions;
  outDir?: string;
  fragmentConcurrency?: number;
  signal?: AbortSignal;
  /** Legacy Piped/Invidious fallback base. */
  extractorUrl?: string;
  onByteProgress?: (info: { downloaded: number; total: number | null; phase?: string }) => void;
};

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
  /** Prefer MP4 output container; stream pick always ranks by height for quality. */
  const preferMp4Out = format === "mp4";
  const preferMp4 = format === "mp4" && quality !== "best";

  let meta: VideoMeta;
  try {
    meta = await resolveInnertubeMeta(id);
  } catch {
    // Fall back to legacy extractor chain (Piped / ytdl)
    const { extractYouTubeViaPiped } = await import("../extract");
    return extractYouTubeViaPiped(url, {
      format,
      quality,
      extractorUrl: opts.extractorUrl,
      fragmentConcurrency: fragmentConcurrencyForQuality(quality, opts.fragmentConcurrency),
      signal: opts.signal,
    });
  }

  const workRoot = opts.outDir ?? path.join(os.tmpdir(), "pinforge-yt", id);
  await fs.mkdir(workRoot, { recursive: true });

  const channelDir =
    ytOpts.organizeByChannel && meta.channel && opts.outDir
      ? path.join(opts.outDir, sanitizeFilename(meta.channel))
      : (opts.outDir ?? workRoot);
  if (opts.outDir) await fs.mkdir(channelDir, { recursive: true });

  // Stable names so Stop → Continue can resume the same .part paths
  const baseName = sanitizeFilename(`${meta.title}-${id}`.slice(0, 180));
  const tmpDir = path.join(workRoot, ".yt-tmp", id);
  await fs.mkdir(tmpDir, { recursive: true });

  const headersAcceptVideo = "video/mp4,video/webm,video/*,*/*;q=0.8";
  const headersAcceptAudio = "audio/*,*/*;q=0.8";
  const concurrency = fragmentConcurrencyForQuality(quality, opts.fragmentConcurrency);
  const resume = ytOpts.resume;
  const onProg = opts.onByteProgress;

  let mediaPath: string;
  let outExt: string;
  let kind: "video" | "audio" = audioOnly ? "audio" : "video";
  let selectedHeight: number | undefined;
  let dashAudioPath: string | undefined;
  let dashAudioExt: string | undefined;

  const wantsVideo = audioOnly ? false : ytOpts.saveVideo !== false;
  const wantsAudioFile = ytOpts.saveAudio !== false;
  const wantsThumbFile = ytOpts.saveThumbnail !== false;

  onProg?.({ downloaded: 0, total: null, phase: "meta" });

  try {
    if (audioOnly) {
      const audio = pickAudioOnly(meta.formats, preferMp4 || ytOpts.audioContainer === "m4a");
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
      // Prefer highest adaptive (DASH) streams; mp4 preference only affects container ranking.
      const dashPreferMp4 = preferMp4;
      const dash = pickDashPair(meta.formats, quality, dashPreferMp4);
      const ff = await resolveFfmpeg();
      const cap = qualityCap(quality);
      const needsHighQuality = quality === "best" || (cap != null && cap >= 1080);

      if (dash?.video.url && dash.audio.url) {
        if (!ff) {
          throw new Error(
            `${requireFfmpegMessage()} High-quality YouTube needs ffmpeg to merge video + audio streams.`
          );
        }
        const vExt = extFromMime(dash.video.mime_type) || "mp4";
        const aExt = extFromMime(dash.audio.mime_type) || "m4a";
        const vPath = path.join(tmpDir, `video.${vExt}`);
        const aPath = path.join(tmpDir, `audio.${aExt}`);
        selectedHeight = heightFromLabel(dash.video.quality_label, dash.video.height) || undefined;
        onProg?.({
          downloaded: 0,
          total: null,
          phase: "download",
        });
        let vTotal: number | null = null;
        let aTotal: number | null = null;
        let vDone = 0;
        let aDone = 0;
        const emitDash = () => {
          const total =
            vTotal != null && aTotal != null
              ? vTotal + aTotal
              : vTotal != null
                ? vTotal * 1.25
                : null;
          const downloaded = vDone + aDone;
          onProg?.({ downloaded, total, phase: "download" });
        };
        await Promise.all([
          downloadUrlToFile(dash.video.url, vPath, {
            concurrency,
            signal: opts.signal,
            resume,
            accept: headersAcceptVideo,
            onProgress: (p) => {
              vDone = p.downloaded;
              vTotal = p.total;
              emitDash();
            },
          }),
          downloadUrlToFile(dash.audio.url, aPath, {
            concurrency,
            signal: opts.signal,
            resume,
            accept: headersAcceptAudio,
            onProgress: (p) => {
              aDone = p.downloaded;
              aTotal = p.total;
              emitDash();
            },
          }),
        ]);
        dashAudioPath = aPath;
        dashAudioExt = aExt;
        outExt =
          preferMp4Out || vExt === "mp4"
            ? "mp4"
            : vExt === "webm" && aExt === "webm"
              ? "webm"
              : "mp4";
        mediaPath = path.join(tmpDir, `merged.${outExt}`);
        onProg?.({
          downloaded: (vTotal ?? vDone) + (aTotal ?? aDone),
          total: (vTotal ?? vDone) + (aTotal ?? aDone),
          phase: "mux",
        });
        if (wantsVideo) {
          await muxAv(vPath, aPath, mediaPath);
        } else {
          // Audio-sidecar-only path still needs a primary file for process pipeline.
          mediaPath = aPath;
          outExt = aExt;
          kind = "audio";
        }
      } else {
        if (needsHighQuality && !ff) {
          throw new Error(
            `${requireFfmpegMessage()} No progressive stream matches ${quality === "best" ? "best" : `${quality}p`}; install ffmpeg for DASH.`
          );
        }
        const progressive = pickProgressive(meta.formats, quality, preferMp4);
        if (!progressive?.url) {
          throw new Error("No matching video stream");
        }
        selectedHeight =
          heightFromLabel(progressive.quality_label, progressive.height) || undefined;
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
    if ((ytOpts.tagMetadata || wantsThumbFile) && meta.thumbnailUrl) {
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
    let finalPath = path.join(finalDir, `${baseName}.${outExt}`);

    const needsTag = ytOpts.tagMetadata || (ytOpts.subtitles === "embed" && Boolean(embedSub));
    const ffTag = await resolveFfmpeg();

    if (needsTag && ffTag && wantsVideo && !audioOnly) {
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
    } else if (needsTag && ffTag && (audioOnly || !wantsVideo)) {
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
      const dest = path.join(finalDir, path.basename(sub));
      await fs.copyFile(sub, dest);
      savedSubs.push(dest);
    }

    let savedAudioPath: string | undefined;
    if (wantsAudioFile && !audioOnly && dashAudioPath) {
      const aExt = dashAudioExt || "m4a";
      const dest = path.join(finalDir, `${baseName}.${aExt}`);
      await fs.copyFile(dashAudioPath, dest);
      savedAudioPath = dest;
    }

    let savedThumbPath: string | undefined;
    if (wantsThumbFile && thumbPath) {
      const ext = path.extname(thumbPath) || ".jpg";
      const dest = path.join(finalDir, `${baseName}${ext}`);
      await fs.copyFile(thumbPath, dest);
      savedThumbPath = dest;
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
        audioPath: savedAudioPath,
        thumbnailPath: savedThumbPath,
        height: selectedHeight,
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
      audioPath: savedAudioPath,
      thumbnailPath: savedThumbPath,
      height: selectedHeight,
    };
  } catch (e) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }
}

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_YOUTUBE_OPTIONS,
  type FormatPreset,
  type ResolvedMedia,
  type YoutubeDownloadOptions,
} from "@pinforge/types";
import type { NamingTemplates } from "@pinforge/types";
import { resolveMediaFileBase, sanitizeFilename } from "@pinforge/types";
import { resolveYoutubePackDir } from "../packDir";
import { fetchBinary, toResolved } from "@pinforge/download";
import { extractYouTubeId } from "../extract";
import {
  audioOutputExt,
  qualityFromFormat,
  fragmentConcurrencyForQuality,
} from "../formats";
import {
  convertAudio,
  embedMetadata,
  requireFfmpegMessage,
  resolveFfmpeg,
} from "../../../media/mux";
import { downloadUrlToFile, pickCaption, writeCaptionFile } from "./download";
import { downloadYouTubeStreams } from "./adaptive";
import { resolveInnertubeMeta, type VideoMeta } from "./meta";

export { previewYouTubeVideo } from "./meta";
export type { YoutubeVideoPreview } from "./meta";

export type YoutubeResolveOpts = {
  format?: FormatPreset;
  youtube?: YoutubeDownloadOptions;
  outDir?: string;
  fragmentConcurrency?: number;
  /** Put the video and its sidecar files in their own folder (default true). */
  packFolders?: boolean;
  /** Custom file / folder name templates. */
  naming?: NamingTemplates;
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

  // Stable names so Stop → Continue can resume the same .part paths (temp only)
  const tmpBase = sanitizeFilename(`${meta.title}-${id}`.slice(0, 120));
  const tmpDir = path.join(workRoot, ".yt-tmp", id);
  await fs.mkdir(tmpDir, { recursive: true });

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
      const audioResult = await downloadYouTubeStreams({
        formats: meta.formats,
        quality,
        format,
        tmpDir,
        fragmentConcurrency: opts.fragmentConcurrency,
        resume,
        signal: opts.signal,
        onProgress: onProg,
      });
      const want = ytOpts.audioContainer;
      outExt = audioOutputExt(want);
      const rawPath = audioResult.mediaPath;
      mediaPath = path.join(tmpDir, `out.${outExt}`);
      const srcExt = path.extname(rawPath).slice(1) || "m4a";
      if (want === "m4a" && (srcExt === "m4a" || srcExt === "mp4")) {
        await fs.copyFile(rawPath, mediaPath);
      } else {
        const ff = await resolveFfmpeg();
        if (!ff) throw new Error(requireFfmpegMessage());
        onProg?.({ downloaded: 0, total: null, phase: "convert" });
        await convertAudio(rawPath, mediaPath, want);
      }
    } else {
      const streamResult = await downloadYouTubeStreams({
        formats: meta.formats,
        quality,
        format,
        tmpDir,
        preferMp4Out,
        wantsVideo,
        fragmentConcurrency: opts.fragmentConcurrency,
        resume,
        signal: opts.signal,
        onProgress: onProg,
      });
      mediaPath = streamResult.mediaPath;
      outExt = streamResult.outExt;
      kind = streamResult.kind;
      selectedHeight = streamResult.selectedHeight;
      dashAudioPath = streamResult.dashAudioPath;
      dashAudioExt = streamResult.dashAudioExt;
    }

    const subtitlePaths: string[] = [];
    let embedSub: string | undefined;
    if (ytOpts.subtitles !== "none" && meta.captions.length) {
      const track = pickCaption(meta.captions, ytOpts.subtitleLang);
      if (track) {
        const capBase = path.join(tmpDir, tmpBase);
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

    const baseName = resolveMediaFileBase(
      {
        title: meta.title,
        id,
        provider: "youtube",
        channel: meta.channel,
        ext: outExt,
        height: selectedHeight,
        date: meta.uploadDate,
      },
      { naming: opts.naming, quality }
    );

    const finalDir = resolveYoutubePackDir({
      packFolders: opts.packFolders,
      channelDir,
      title: meta.title,
      videoId: id,
      folderTemplate: opts.naming?.folderName,
    });
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
      id,
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

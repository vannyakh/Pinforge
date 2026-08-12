import fs from "node:fs/promises";
import path from "node:path";
import type { FormatPreset, YoutubeQuality } from "@pinforge/types";
import {
  extFromMime,
  heightFromLabel,
  pickAudioOnly,
  pickDashPair,
  pickProgressive,
  qualityCap,
  streamDownloadOptionsForQuality,
  type YtStreamFormat,
} from "../formats";
import { muxAv, requireFfmpegMessage, resolveFfmpeg } from "../../../media/mux";
import { downloadUrlToFile } from "./download";

const HEADERS_VIDEO = "video/mp4,video/webm,video/*,*/*;q=0.8";
const HEADERS_AUDIO = "audio/*,*/*;q=0.8";

export type AdaptiveDownloadResult = {
  mediaPath: string;
  outExt: string;
  kind: "video" | "audio";
  selectedHeight?: number;
  dashAudioPath?: string;
  dashAudioExt?: string;
};

export type AdaptiveDownloadOpts = {
  formats: YtStreamFormat[];
  quality: YoutubeQuality;
  format: FormatPreset;
  tmpDir: string;
  preferMp4Out?: boolean;
  wantsVideo?: boolean;
  fragmentConcurrency?: number;
  resume?: boolean;
  signal?: AbortSignal;
  onProgress?: (info: { downloaded: number; total: number | null; phase?: string }) => void;
};

/** Download highest adaptive (separate video + audio) or progressive stream to disk. */
export async function downloadYouTubeStreams(
  opts: AdaptiveDownloadOpts
): Promise<AdaptiveDownloadResult> {
  const {
    formats,
    quality,
    format,
    tmpDir,
    preferMp4Out = format === "mp4",
    wantsVideo = true,
    fragmentConcurrency,
    resume = true,
    signal,
    onProgress,
  } = opts;

  await fs.mkdir(tmpDir, { recursive: true });

  const audioOnly = format === "audio-only";
  const preferMp4 = format === "mp4" && quality !== "best";
  const streamOpts = streamDownloadOptionsForQuality(quality, fragmentConcurrency);
  const cap = qualityCap(quality);
  const needsHighQuality = quality === "best" || (cap != null && cap >= 1080);

  if (audioOnly) {
    const audio = pickAudioOnly(formats, preferMp4);
    if (!audio?.url) throw new Error("No audio stream available");
    const srcExt = extFromMime(audio.mime_type) || "m4a";
    const mediaPath = path.join(tmpDir, `audio.${srcExt}`);
    onProgress?.({ downloaded: 0, total: null, phase: "download" });
    await downloadUrlToFile(audio.url, mediaPath, {
      ...streamOpts,
      signal,
      resume,
      accept: HEADERS_AUDIO,
      onProgress: (p) => onProgress?.({ ...p, phase: "download" }),
    });
    return { mediaPath, outExt: srcExt, kind: "audio" };
  }

  const dash = pickDashPair(formats, quality, preferMp4);
  const ff = await resolveFfmpeg();

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
    const selectedHeight =
      heightFromLabel(dash.video.quality_label, dash.video.height) || undefined;

    onProgress?.({ downloaded: 0, total: null, phase: "download" });
    let vTotal: number | null = null;
    let aTotal: number | null = null;
    let vDone = 0;
    let aDone = 0;
    const emitDash = () => {
      const total =
        vTotal != null && aTotal != null ? vTotal + aTotal : vTotal != null ? vTotal * 1.25 : null;
      onProgress?.({ downloaded: vDone + aDone, total, phase: "download" });
    };

    await Promise.all([
      downloadUrlToFile(dash.video.url, vPath, {
        ...streamOpts,
        signal,
        resume,
        accept: HEADERS_VIDEO,
        onProgress: (p) => {
          vDone = p.downloaded;
          vTotal = p.total;
          emitDash();
        },
      }),
      downloadUrlToFile(dash.audio.url, aPath, {
        ...streamOpts,
        signal,
        resume,
        accept: HEADERS_AUDIO,
        onProgress: (p) => {
          aDone = p.downloaded;
          aTotal = p.total;
          emitDash();
        },
      }),
    ]);

    const outExt =
      preferMp4Out || vExt === "mp4" ? "mp4" : vExt === "webm" && aExt === "webm" ? "webm" : "mp4";

    if (!wantsVideo) {
      return {
        mediaPath: aPath,
        outExt: aExt,
        kind: "audio",
        selectedHeight,
        dashAudioPath: aPath,
        dashAudioExt: aExt,
      };
    }

    const mediaPath = path.join(tmpDir, `merged.${outExt}`);
    onProgress?.({
      downloaded: (vTotal ?? vDone) + (aTotal ?? aDone),
      total: (vTotal ?? vDone) + (aTotal ?? aDone),
      phase: "mux",
    });
    await muxAv(vPath, aPath, mediaPath);
    return {
      mediaPath,
      outExt,
      kind: "video",
      selectedHeight,
      dashAudioPath: aPath,
      dashAudioExt: aExt,
    };
  }

  if (needsHighQuality && !ff) {
    throw new Error(
      `${requireFfmpegMessage()} No progressive stream matches ${quality === "best" ? "best" : `${quality}p`}; install ffmpeg for adaptive streams.`
    );
  }

  const progressive = pickProgressive(formats, quality, preferMp4);
  if (!progressive?.url) throw new Error("No matching video stream");
  const selectedHeight =
    heightFromLabel(progressive.quality_label, progressive.height) || undefined;
  const outExt = extFromMime(progressive.mime_type) || "mp4";
  const mediaPath = path.join(tmpDir, `progressive.${outExt}`);
  onProgress?.({ downloaded: 0, total: null, phase: "download" });
  await downloadUrlToFile(progressive.url, mediaPath, {
    ...streamOpts,
    signal,
    resume,
    accept: HEADERS_VIDEO,
    onProgress: (p) => onProgress?.({ ...p, phase: "download" }),
  });
  return { mediaPath, outExt, kind: "video", selectedHeight };
}

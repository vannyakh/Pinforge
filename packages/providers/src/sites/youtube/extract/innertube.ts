import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FormatPreset, ResolvedMedia, YoutubeQuality } from "@pinforge/types";
import { normalizeStreamFlags, type YtStreamFormat } from "../formats";
import { downloadYouTubeStreams } from "../service/adaptive";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let innertubeMod: any = null;

async function getInnertube() {
  if (!innertubeMod) {
    innertubeMod = await import("youtubei.js");
  }
  return innertubeMod as typeof import("youtubei.js");
}

type YtFormatLike = {
  itag?: number;
  url?: string;
  mime_type?: string;
  quality_label?: string;
  has_video?: boolean;
  has_audio?: boolean;
  bitrate?: number;
  average_bitrate?: number;
  width?: number;
  height?: number;
};

function toStreamFormats(formats: YtFormatLike[]): YtStreamFormat[] {
  return formats
    .filter((f) => Boolean(f.url))
    .map((f) =>
      normalizeStreamFlags({
        itag: f.itag,
        url: f.url,
        mime_type: f.mime_type,
        quality_label: f.quality_label,
        has_video: f.has_video,
        has_audio: f.has_audio,
        bitrate: f.bitrate,
        average_bitrate: f.average_bitrate,
        width: f.width,
        height: f.height,
      })
    );
}

export async function extractViaInnertube(
  id: string,
  sourceUrl: string,
  format: FormatPreset,
  opts: { fragmentConcurrency?: number; signal?: AbortSignal } = {},
  quality: YoutubeQuality = "best"
): Promise<ResolvedMedia> {
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
      const title = info.basic_info?.title ?? id;
      const formats: YtFormatLike[] = [
        ...(info.streaming_data?.formats ?? []),
        ...(info.streaming_data?.adaptive_formats ?? []),
      ].filter((f: YtFormatLike) => Boolean(f.url));

      if (!formats.length) {
        throw new Error(`No direct stream URLs (${String(client)})`);
      }

      const tmpDir = path.join(os.tmpdir(), "pinforge-yt-fallback", id, String(client));
      const streamResult = await downloadYouTubeStreams({
        formats: toStreamFormats(formats),
        quality,
        format,
        tmpDir,
        fragmentConcurrency: opts.fragmentConcurrency,
        resume: true,
        signal: opts.signal,
      });

      const buffer = await fs.readFile(streamResult.mediaPath);
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      if (!buffer.length) throw new Error("Empty download");

      return {
        kind: streamResult.kind,
        buffer,
        ext: streamResult.outExt,
        sourceUrl,
        title,
        provider: "youtube",
        height: streamResult.selectedHeight,
      };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Innertube extraction failed");
}

import type { FormatPreset, ResolvedMedia, YoutubeQuality } from "@pinforge/types";
import { fetchBinary, toResolved } from "@pinforge/download";
import { heightFromLabel, qualityCap } from "../formats";

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

function pickInnertubeFormat(
  formats: YtFormatLike[],
  format: FormatPreset,
  quality: YoutubeQuality = "best"
): YtFormatLike | undefined {
  const bitrate = (f: YtFormatLike) => Number(f.average_bitrate ?? f.bitrate ?? 0);
  const cap = qualityCap(quality);
  const heightOk = (f: YtFormatLike) => {
    if (cap == null) return true;
    const h = heightFromLabel(f.quality_label, f.height);
    return h <= 0 || h <= cap;
  };
  if (format === "audio-only") {
    const audio = formats
      .filter((f) => f.has_audio && !f.has_video)
      .sort((a, b) => bitrate(b) - bitrate(a));
    if (audio[0]) return audio[0];
    // Progressive muxed still has audio — usable fallback
    return formats.filter((f) => f.has_audio).sort((a, b) => bitrate(b) - bitrate(a))[0];
  }

  const muxed = formats
    .filter((f) => f.has_video && f.has_audio && heightOk(f))
    .sort(
      (a, b) =>
        heightFromLabel(b.quality_label, b.height) - heightFromLabel(a.quality_label, a.height) ||
        bitrate(b) - bitrate(a)
    );
  if (muxed[0]) return muxed[0];
  const anyMuxed = formats
    .filter((f) => f.has_video && f.has_audio)
    .sort((a, b) => bitrate(b) - bitrate(a));
  if (anyMuxed[0]) return anyMuxed[0];
  return (
    formats.find((f) => f.has_video && heightOk(f)) ??
    formats.find((f) => f.has_video) ??
    formats[0]
  );
}

function extFromMime(mime?: string): string | undefined {
  if (!mime) return undefined;
  if (/webm/i.test(mime)) return "webm";
  if (/mp4|m4a|aac/i.test(mime)) return /audio\//i.test(mime) ? "m4a" : "mp4";
  return undefined;
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

      const pick = pickInnertubeFormat(formats, format, quality);
      if (!pick?.url) throw new Error("No matching format URL");

      const { buffer, ext } = await fetchBinary(pick.url, {
        referer: "https://www.youtube.com/",
        accept: format === "audio-only" ? "audio/*,*/*;q=0.8" : "video/mp4,video/*,*/*;q=0.8",
        concurrency: opts.fragmentConcurrency ?? 4,
        signal: opts.signal,
      });
      if (!buffer.length) throw new Error("Empty download");

      const outExt =
        extFromMime(pick.mime_type) || (format === "audio-only" ? "m4a" : ext || "mp4");
      return toResolved("youtube", sourceUrl, buffer, outExt, title, format);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Innertube extraction failed");
}

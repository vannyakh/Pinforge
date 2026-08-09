import type { AudioContainer, FormatPreset, YoutubeQuality } from "../../types";

export type YtStreamFormat = {
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

export function heightFromLabel(label?: string, height?: number): number {
  if (height && height > 0) return height;
  if (!label) return 0;
  const m = label.match(/(\d{3,4})/);
  return m ? Number(m[1]) : 0;
}

export function bitrateOf(f: YtStreamFormat): number {
  return Number(f.average_bitrate ?? f.bitrate ?? 0);
}

export function extFromMime(mime?: string): string | undefined {
  if (!mime) return undefined;
  if (/webm/i.test(mime)) return "webm";
  if (/mp4|m4a|aac/i.test(mime)) return /audio\//i.test(mime) ? "m4a" : "mp4";
  if (/opus/i.test(mime)) return "opus";
  return undefined;
}

export function qualityCap(quality: YoutubeQuality): number | null {
  if (quality === "best") return null;
  const n = Number(quality);
  return Number.isFinite(n) ? n : null;
}

/** Map coarse FormatPreset → quality preference. */
export function qualityFromFormat(format: FormatPreset, quality?: YoutubeQuality): YoutubeQuality {
  if (format === "audio-only") return "best";
  return quality ?? "best";
}

export function pickAudioOnly(formats: YtStreamFormat[]): YtStreamFormat | undefined {
  const audio = formats
    .filter((f) => f.url && f.has_audio && !f.has_video)
    .sort((a, b) => bitrateOf(b) - bitrateOf(a));
  if (audio[0]) return audio[0];
  return formats
    .filter((f) => f.url && f.has_audio)
    .sort((a, b) => bitrateOf(b) - bitrateOf(a))[0];
}

export function pickProgressive(
  formats: YtStreamFormat[],
  quality: YoutubeQuality
): YtStreamFormat | undefined {
  const cap = qualityCap(quality);
  const muxed = formats
    .filter((f) => f.url && f.has_video && f.has_audio)
    .map((f) => ({ f, h: heightFromLabel(f.quality_label, f.height) }))
    .filter((x) => (cap == null ? true : x.h <= cap || x.h === 0))
    .sort((a, b) => b.h - a.h || bitrateOf(b.f) - bitrateOf(a.f));
  if (muxed[0]) return muxed[0].f;
  // If cap filtered everything, take highest muxed under any height
  return formats
    .filter((f) => f.url && f.has_video && f.has_audio)
    .sort(
      (a, b) =>
        heightFromLabel(b.quality_label, b.height) - heightFromLabel(a.quality_label, a.height) ||
        bitrateOf(b) - bitrateOf(a)
    )[0];
}

export function pickDashPair(
  formats: YtStreamFormat[],
  quality: YoutubeQuality
): { video: YtStreamFormat; audio: YtStreamFormat } | null {
  const cap = qualityCap(quality);
  const videos = formats
    .filter((f) => f.url && f.has_video && !f.has_audio)
    .map((f) => ({ f, h: heightFromLabel(f.quality_label, f.height) }))
    .filter((x) => (cap == null ? true : x.h > 0 ? x.h <= cap : true))
    .sort((a, b) => b.h - a.h || bitrateOf(b.f) - bitrateOf(a.f));

  const audio = pickAudioOnly(formats);
  if (!videos[0] || !audio) return null;

  // Prefer same container family (mp4+m4a or webm+webm)
  const videoExt = extFromMime(videos[0].f.mime_type) ?? "mp4";
  const matchedAudio =
    formats
      .filter((f) => f.url && f.has_audio && !f.has_video)
      .filter((f) => {
        const ae = extFromMime(f.mime_type);
        if (videoExt === "webm") return ae === "webm" || ae === "opus";
        return ae === "m4a" || ae === "mp4" || !ae;
      })
      .sort((a, b) => bitrateOf(b) - bitrateOf(a))[0] ?? audio;

  return { video: videos[0].f, audio: matchedAudio };
}

export function audioOutputExt(container: AudioContainer): string {
  return container;
}

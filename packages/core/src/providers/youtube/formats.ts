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

/** Infer A/V flags when Innertube omits has_video / has_audio. */
export function normalizeStreamFlags(f: YtStreamFormat): YtStreamFormat {
  const mime = f.mime_type ?? "";
  const hasVideo =
    f.has_video ??
    (/^video\//i.test(mime) || Boolean(f.height) || Boolean(f.quality_label));
  const hasAudio =
    f.has_audio ?? (/^audio\//i.test(mime) || (/audio/i.test(mime) && !hasVideo));
  return { ...f, has_video: Boolean(hasVideo), has_audio: Boolean(hasAudio) };
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

const KNOWN_HEIGHT_QUALITIES = ["4320", "2160", "1440", "1080", "720", "480", "360"] as const;

const DEFAULT_QUALITY_CHOICES: YoutubeQuality[] = [
  "best",
  "2160",
  "1440",
  "1080",
  "720",
  "480",
  "360",
];

/** UI options: Best + heights from preview, or the default ladder (includes 4320 only when available). */
export function youtubeQualityChoices(availableHeights?: number[]): YoutubeQuality[] {
  if (!availableHeights?.length) return [...DEFAULT_QUALITY_CHOICES];
  const known = new Set<string>(KNOWN_HEIGHT_QUALITIES);
  const fromPreview: YoutubeQuality[] = [];
  for (const h of availableHeights) {
    const key = String(h);
    if (!known.has(key)) continue;
    const q = key as YoutubeQuality;
    if (!fromPreview.includes(q)) fromPreview.push(q);
  }
  return fromPreview.length ? (["best", ...fromPreview] as YoutubeQuality[]) : [...DEFAULT_QUALITY_CHOICES];
}

/** Default fragment concurrency for a quality target (higher for 1080p+ / best). */
export function fragmentConcurrencyForQuality(
  quality: YoutubeQuality,
  override?: number
): number {
  if (typeof override === "number" && override > 0) return override;
  if (quality === "best") return 6;
  const cap = qualityCap(quality);
  if (cap != null && cap >= 1080) return 6;
  return 4;
}

export function pickAudioOnly(
  formats: YtStreamFormat[],
  preferMp4 = false
): YtStreamFormat | undefined {
  const audio = formats
    .filter((f) => f.url && f.has_audio && !f.has_video)
    .sort((a, b) => {
      if (preferMp4) {
        const aMp4 = /mp4|m4a|aac/i.test(a.mime_type ?? "") ? 1 : 0;
        const bMp4 = /mp4|m4a|aac/i.test(b.mime_type ?? "") ? 1 : 0;
        if (aMp4 !== bMp4) return bMp4 - aMp4;
      }
      return bitrateOf(b) - bitrateOf(a);
    });
  if (audio[0]) return audio[0];
  return formats
    .filter((f) => f.url && f.has_audio)
    .sort((a, b) => bitrateOf(b) - bitrateOf(a))[0];
}

export function pickProgressive(
  formats: YtStreamFormat[],
  quality: YoutubeQuality,
  preferMp4 = false
): YtStreamFormat | undefined {
  const cap = qualityCap(quality);
  const rank = (f: YtStreamFormat) => {
    const h = heightFromLabel(f.quality_label, f.height);
    const mp4Boost = preferMp4 && /mp4/i.test(f.mime_type ?? "") ? 1 : 0;
    return { f, h, mp4Boost };
  };
  const muxed = formats
    .filter((f) => f.url && f.has_video && f.has_audio)
    .map(rank)
    .filter((x) => (cap == null ? true : x.h <= cap || x.h === 0))
    .sort(
      (a, b) =>
        b.mp4Boost - a.mp4Boost || b.h - a.h || bitrateOf(b.f) - bitrateOf(a.f)
    );
  if (muxed[0]) return muxed[0].f;
  return formats
    .filter((f) => f.url && f.has_video && f.has_audio)
    .map(rank)
    .sort(
      (a, b) =>
        b.mp4Boost - a.mp4Boost || b.h - a.h || bitrateOf(b.f) - bitrateOf(a.f)
    )[0]?.f;
}

export function pickDashPair(
  formats: YtStreamFormat[],
  quality: YoutubeQuality,
  preferMp4 = false
): { video: YtStreamFormat; audio: YtStreamFormat } | null {
  const cap = qualityCap(quality);
  const videos = formats
    .filter((f) => f.url && f.has_video && !f.has_audio)
    .map((f) => ({
      f,
      h: heightFromLabel(f.quality_label, f.height),
      mp4: /mp4/i.test(f.mime_type ?? ""),
    }))
    .filter((x) => (cap == null ? true : x.h > 0 ? x.h <= cap : true))
    .sort((a, b) => {
      if (preferMp4 && a.mp4 !== b.mp4) return a.mp4 ? -1 : 1;
      return b.h - a.h || bitrateOf(b.f) - bitrateOf(a.f);
    });

  const audio = pickAudioOnly(formats, preferMp4);
  if (!videos[0] || !audio) return null;

  const videoExt = extFromMime(videos[0].f.mime_type) ?? "mp4";
  const matchedAudio =
    formats
      .filter((f) => f.url && f.has_audio && !f.has_video)
      .filter((f) => {
        const ae = extFromMime(f.mime_type);
        if (preferMp4 || videoExt === "mp4") {
          return ae === "m4a" || ae === "mp4" || !ae;
        }
        if (videoExt === "webm") return ae === "webm" || ae === "opus";
        return ae === "m4a" || ae === "mp4" || !ae;
      })
      .sort((a, b) => bitrateOf(b) - bitrateOf(a))[0] ?? audio;

  return { video: videos[0].f, audio: matchedAudio };
}

export function audioOutputExt(container: AudioContainer): string {
  return container;
}

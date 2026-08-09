export type PresetName = "auto" | "soft" | "crisp" | "upscale";

export type MediaKind = "image" | "video" | "audio";

/** Toggleable stills enhance steps (Pinforge pipeline only). */
export interface EnhanceFeatures {
  autoLevels: boolean;
  denoise: boolean;
  sharpen: boolean;
  upscale: boolean;
  /** Keep a copy of the original file next to the enhanced output. */
  keepOriginal: boolean;
}

export const DEFAULT_ENHANCE_FEATURES: EnhanceFeatures = {
  autoLevels: true,
  denoise: true,
  sharpen: true,
  upscale: false,
  keepOriginal: true,
};

export type ProviderId =
  | "pinterest"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "douyin"
  | "spotify"
  | "apple-music"
  | "capcut"
  | "bluesky"
  | "rednote"
  | "threads"
  | "kuaishou"
  | "weibo";

export type FormatPreset = "best" | "mp4" | "audio-only";

/** Max video height for YouTube single downloads (`best` = highest available). */
export type YoutubeQuality = "best" | "4320" | "2160" | "1440" | "1080" | "720" | "480" | "360";

export type AudioContainer = "m4a" | "mp3" | "flac";

export type SubtitleMode = "none" | "separate" | "embed";

export interface YoutubeDownloadOptions {
  /** Preferred max height (ignored for audio-only). */
  quality?: YoutubeQuality;
  /** Audio output container when format is audio-only (or extracted). */
  audioContainer?: AudioContainer;
  /** Caption handling. */
  subtitles?: SubtitleMode;
  /** Preferred caption language (default en). */
  subtitleLang?: string;
  /** Sort into outDir/<channel>/ (default true). */
  organizeByChannel?: boolean;
  /** Embed title/uploader/date/thumbnail via ffmpeg (default true). */
  tagMetadata?: boolean;
  /** Resume interrupted .part downloads (default true). */
  resume?: boolean;
  /** Max videos to pull from a channel / profile (default 50, max 500). */
  channelMaxVideos?: number;
}

export const DEFAULT_YOUTUBE_OPTIONS: Required<YoutubeDownloadOptions> = {
  quality: "best",
  audioContainer: "m4a",
  subtitles: "separate",
  subtitleLang: "en",
  organizeByChannel: true,
  tagMetadata: true,
  resume: true,
  channelMaxVideos: 50,
};

/** What kinds of URLs / jobs a provider can handle. */
export type DownloadMode = "single" | "board" | "profile" | "playlist" | "story";

export interface ProcessOptions {
  preset: PresetName;
  outDir: string;
  delayMs?: number;
  /** Apply sharp enhance for images (default true for Pinterest stills). */
  enhance?: boolean;
  /** Per-step enhance toggles (stills pipeline). */
  features?: Partial<EnhanceFeatures>;
  format?: FormatPreset;
  /** YouTube single-video options (quality, audio, subs, folders). */
  youtube?: YoutubeDownloadOptions;
  /** Piped-compatible extractor API base (YouTube fallback). */
  extractorUrl?: string;
  /** Concurrent item downloads for boards/batches (default 3). */
  itemConcurrency?: number;
  /** Parallel Range fragments per file (default 4). */
  fragmentConcurrency?: number;
  signal?: AbortSignal;
}

export interface PinAsset {
  buffer: Buffer;
  ext: string;
  sourceUrl: string;
  title?: string;
  kind?: MediaKind;
}

export interface ResolvedMedia {
  kind: MediaKind;
  buffer?: Buffer;
  /** When provider already wrote a file to disk. */
  filePath?: string;
  ext: string;
  sourceUrl: string;
  title?: string;
  provider: ProviderId;
  /** Channel / uploader name for auto-organization. */
  channel?: string;
  /** Sidecar subtitle paths written next to the media. */
  subtitlePaths?: string[];
}

export interface EnhancedAsset {
  buffer: Buffer;
  ext: string;
}

export interface ProcessResult {
  outPath: string;
  sourceUrl: string;
  originalPath?: string;
  title?: string;
  provider?: ProviderId;
  kind?: MediaKind;
}

export interface DownloadResult {
  results: ProcessResult[];
  errors: { url: string; error: string }[];
  provider: ProviderId;
  kind: "single" | "batch";
}

export interface PipelineOptions {
  preset: PresetName;
  features?: Partial<EnhanceFeatures>;
}

export interface EnhanceStepOptions {
  strength?: number;
}

export interface BoardResolveResult {
  pinUrls: string[];
  boardName?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  status: "live" | "stub";
  formats?: FormatPreset[];
  /** Supported download modes (single media, board, profile, …). */
  modes?: DownloadMode[];
}

export const PRESETS: Record<
  PresetName,
  {
    label: string;
    description: string;
    denoise: number;
    sharpen: number;
    upscale: number;
    autoLevels: boolean;
  }
> = {
  auto: {
    label: "Auto",
    description: "Balanced levels, light denoise, mild sharpen",
    denoise: 0.35,
    sharpen: 0.6,
    upscale: 1,
    autoLevels: true,
  },
  soft: {
    label: "Soft",
    description: "Gentle cleanup, minimal sharpening",
    denoise: 0.5,
    sharpen: 0.25,
    upscale: 1,
    autoLevels: true,
  },
  crisp: {
    label: "Crisp",
    description: "Stronger sharpen, light denoise",
    denoise: 0.2,
    sharpen: 1.1,
    upscale: 1,
    autoLevels: true,
  },
  upscale: {
    label: "Upscale 2×",
    description: "2× upscale with denoise and sharpen",
    denoise: 0.4,
    sharpen: 0.8,
    upscale: 2,
    autoLevels: true,
  },
};

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
  /** Catch-all via external yt-dlp binary for non-builtin sites. */
  | "ytdlp";

export type FormatPreset = "best" | "mp4" | "audio-only";

/** Placeholder keys for file / folder name templates (Settings → Download). */
export type NamingTemplateKey =
  "title" | "id" | "provider" | "channel" | "ext" | "date" | "quality" | "height" | "index";

export interface NamingTemplates {
  /** Output filename without extension. Default `{title}-{id}`. */
  fileName?: string;
  /** Pack folder name when folder-per-download is on. Default `{title}-{id}`. */
  folderName?: string;
}

export const DEFAULT_NAMING_TEMPLATES: Required<NamingTemplates> = {
  fileName: "{title}-{id}",
  folderName: "{title}-{id}",
};

export const NAMING_TEMPLATE_VARIABLES: ReadonlyArray<{
  key: NamingTemplateKey;
  label: string;
  description: string;
}> = [
  { key: "title", label: "Title", description: "Video or post title" },
  { key: "id", label: "ID", description: "Source id (video id, pin id, …)" },
  { key: "provider", label: "Provider", description: "Site id (youtube, pinterest, …)" },
  { key: "channel", label: "Channel", description: "Uploader or channel name" },
  { key: "ext", label: "Ext", description: "File extension (filenames only)" },
  { key: "date", label: "Date", description: "Upload date or today (YYYY-MM-DD)" },
  { key: "quality", label: "Quality", description: "YouTube quality target (best, 1080, …)" },
  { key: "height", label: "Height", description: "Stream height in px when known" },
  { key: "index", label: "Index", description: "1-based index in a batch" },
];

export type FeatureSupport = "yes" | "limited" | "no";

export type PlatformFeature =
  | "singleVideo"
  | "audioOnly"
  | "photo"
  | "carousel"
  | "story"
  | "reelsShorts"
  | "playlist"
  | "profileBatch"
  | "subtitles"
  | "thumbnail"
  | "metadata"
  | "qualitySelect"
  | "watermarkRemoval"
  | "resume";

export type ProviderFeatureMatrix = Record<PlatformFeature, FeatureSupport>;

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
  /** Max videos to pull from a playlist / mix (default 50, max 500). */
  playlistMaxVideos?: number;
  /** Save merged video file (default true; ignored for audio-only). */
  saveVideo?: boolean;
  /** Also save a separate audio track file (default true). */
  saveAudio?: boolean;
  /** Save thumbnail as a sidecar image (default true). */
  saveThumbnail?: boolean;
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
  playlistMaxVideos: 50,
  saveVideo: true,
  saveAudio: true,
  saveThumbnail: true,
};

export interface PinterestOptions {
  /** Browser Cookie header (or Netscape lines) for private boards. */
  cookies?: string;
  /** Cap pins listed/downloaded from a board/profile/search (1–2000). */
  boardMaxPins?: number;
  /** After a board/profile batch, zip the output folder. */
  zipBoards?: boolean;
}

export const DEFAULT_PINTEREST_OPTIONS: Required<PinterestOptions> = {
  cookies: "",
  boardMaxPins: 200,
  zipBoards: false,
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
  /** Pinterest board/profile options (cookies applied via configurePinterestCookies). */
  pinterest?: PinterestOptions;
  /** Piped-compatible extractor API base (YouTube fallback). */
  extractorUrl?: string;
  /** Concurrent item downloads for boards/batches (default 3). */
  itemConcurrency?: number;
  /** Parallel Range fragments per file (default 4). */
  fragmentConcurrency?: number;
  /**
   * Put downloads that produce several files (carousels, photo posts, videos
   * with subtitle/audio/thumbnail sidecars) in their own folder (default true).
   */
  packFolders?: boolean;
  /** Custom file and folder name templates ({title}, {id}, …). */
  naming?: NamingTemplates;
  signal?: AbortSignal;
}

export interface ProcessBoardOptions extends ProcessOptions {
  onProgress?: (info: {
    current: number;
    total: number;
    url: string;
    result?: ProcessResult;
    error?: string;
    /** 0–100 when byte progress is known */
    percent?: number;
    downloaded?: number;
    totalBytes?: number | null;
    phase?: string;
    title?: string;
  }) => void;
}

export interface PinAsset {
  buffer: Buffer;
  ext: string;
  sourceUrl: string;
  title?: string;
  kind?: MediaKind;
  /** Stable Pinterest pin id when known. */
  pinId?: string;
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
  /** Stable content id (e.g. Pinterest pin id, YouTube video id). */
  id?: string;
  /** Sidecar subtitle paths written next to the media. */
  subtitlePaths?: string[];
  /** Sidecar audio file when saveAudio is enabled. */
  audioPath?: string;
  /** Sidecar thumbnail file when saveThumbnail is enabled. */
  thumbnailPath?: string;
  /** Selected stream height (px) when known. */
  height?: number;
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
  /** True when file already existed and download was skipped. */
  skipped?: boolean;
  /** Output stream height (px) when known (e.g. YouTube adaptive pick). */
  height?: number;
  /** Format preset used for this download. */
  format?: FormatPreset;
  /** YouTube max-height target when applicable. */
  youtubeQuality?: YoutubeQuality;
}

export interface DownloadResult {
  results: ProcessResult[];
  errors: { url: string; error: string }[];
  provider: ProviderId;
  kind: "single" | "batch";
  /** Path to ZIP when board zip export ran. */
  zipPath?: string;
}

export interface PipelineOptions {
  preset: PresetName;
  features?: Partial<EnhanceFeatures>;
}

export interface EnhanceStepOptions {
  strength?: number;
}

/** One pin row from a board / profile / search listing. */
export interface PinListItem {
  pinId: string;
  url: string;
  title?: string;
  coverUrl?: string;
}

export interface BoardResolveResult {
  pinUrls: string[];
  /** Richer listing when scraped from page JSON. */
  pins?: PinListItem[];
  boardName?: string;
  /** board | profile | section | search */
  kind?: "board" | "profile" | "section" | "search";
  truncated?: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  status: "live" | "stub";
  formats?: FormatPreset[];
  /** Supported download modes (single media, board, profile, …). */
  modes?: DownloadMode[];
  /** Platform capability matrix when available. */
  features?: ProviderFeatureMatrix;
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

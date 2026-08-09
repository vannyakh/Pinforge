export type PresetName = "auto" | "soft" | "crisp" | "upscale";

export type MediaKind = "image" | "video" | "audio";

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

export interface ProcessOptions {
  preset: PresetName;
  outDir: string;
  delayMs?: number;
  /** Apply sharp enhance for images (default true for Pinterest stills). */
  enhance?: boolean;
  format?: FormatPreset;
  /** Piped-compatible extractor API base (YouTube). */
  extractorUrl?: string;
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

import "./providers";

export { processPin, processBoard, processUrl, processMedia, detectMediaProvider } from "./process";
export type { ProcessBoardOptions } from "./process";
export { extractMediaPreview, coverUrlFromMediaUrl } from "./extractPreview";
export type {
  ExtractPreview,
  ExtractPreviewItem,
  ExtractPreviewOptions,
} from "./extractPreview";
export { resolvePin, resolveBoard, isBoardUrl, isPinUrl, isPinterestUrl } from "./providers";
export {
  isYouTubeChannelUrl,
  resolveYouTubeChannel,
  isYouTubePlaylistUrl,
  resolveYouTubePlaylist,
} from "./providers";
export type { YoutubeChannelVideo, YoutubeChannelResolveResult } from "./providers";
export type { YoutubePlaylistVideo, YoutubePlaylistResolveResult } from "./providers";
export {
  listProviders,
  getProvider,
  detectProvider,
  registerProvider,
  ProviderNotImplementedError,
  ProviderNotFoundError,
  scrapePageMeta,
  fetchHtmlOrPlaywrightMeta,
  closePlaywrightBrowser,
} from "./providers";
export type { PageMeta, ScrapeMetaOptions } from "./providers";
export { runPipeline } from "./pipeline/runPipeline";
export { mapPool, runPool, downloadToFile, downloadToBuffer } from "./download";
export type { FragmentDownloadOptions, FragmentDownloadResult, MapPoolOptions } from "./download";
export { resolveWorkerBinary, rustPing, rustEnhance, rustDownload } from "./worker/rustWorker";
export { configureFfmpeg, clearFfmpegCache, resolveFfmpeg } from "./providers/youtube/mux";
export { PRESETS, DEFAULT_ENHANCE_FEATURES, DEFAULT_YOUTUBE_OPTIONS } from "./types";
export type {
  PresetName,
  ProcessOptions,
  ProcessResult,
  PinAsset,
  EnhancedAsset,
  PipelineOptions,
  BoardResolveResult,
  ProviderId,
  MediaKind,
  FormatPreset,
  DownloadMode,
  DownloadResult,
  ResolvedMedia,
  ProviderInfo,
  EnhanceFeatures,
  YoutubeQuality,
  AudioContainer,
  SubtitleMode,
  YoutubeDownloadOptions,
} from "./types";

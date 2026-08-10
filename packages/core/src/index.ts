import "./providers";

export { processPin, processBoard, processUrl, processMedia, detectMediaProvider } from "./process";
export type { ProcessBoardOptions } from "./process";
export { extractMediaPreview, coverUrlFromMediaUrl } from "./extractPreview";
export type { ExtractPreview, ExtractPreviewItem, ExtractPreviewOptions } from "./extractPreview";
export {
  resolvePin,
  resolveBoard,
  isBoardUrl,
  isPinUrl,
  isPinterestUrl,
  isProfileUrl,
  isPinterestCollectionUrl,
} from "./providers";
export {
  isYouTubeChannelUrl,
  resolveYouTubeChannel,
  isYouTubePlaylistUrl,
  isYouTubeMixPlaylistId,
  resolveYouTubePlaylist,
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  seedVideoIdFromMixPlaylistId,
} from "./providers";
export type { YoutubeChannelVideo, YoutubeChannelResolveResult } from "./providers";
export type { YoutubePlaylistVideo, YoutubePlaylistResolveResult } from "./providers";
export {
  isTikTokProfileUrl,
  resolveTikTokProfile,
  normalizeTikTokProfileUrl,
  extractTikTokUsername,
} from "./providers";
export type { TikTokProfileVideo, TikTokProfileResolveResult } from "./providers";
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
  registerProviderPlugin,
  listProviderPlugins,
  getProviderPlugin,
  featuresForProvider,
  PROVIDER_FEATURE_MATRIX,
  CORE_ENGINE_FEATURES,
} from "./providers";
export type { PageMeta, ScrapeMetaOptions } from "./providers";
export type {
  ProviderPlugin,
  MediaInfo,
  RegisteredPluginInfo,
  FeatureSupport,
  PlatformFeature,
  ProviderFeatureMatrix,
} from "./providers";
export { extractInstagram, extractTikTok, extractFacebook } from "./providers";
export { runPipeline } from "./pipeline/runPipeline";
export {
  mapPool,
  runPool,
  downloadToFile,
  downloadToBuffer,
  rangeDownloadToFile,
  probeRangeResource,
  downloadSegments,
  ResumeManager,
  CheckpointStore,
  validateCheckpoint,
  recoverCheckpoint,
} from "./download";
export type {
  FragmentDownloadOptions,
  FragmentDownloadResult,
  MapPoolOptions,
  RangeDownloadOptions,
  RangeProbe,
  SegmentDownloadOptions,
  SegmentDownloadResult,
  RecoveryResult,
} from "./download";
export { resolveWorkerBinary, rustPing, rustEnhance, rustDownload } from "./worker/rustWorker";
export { configureFfmpeg, clearFfmpegCache, resolveFfmpeg } from "./providers/youtube/mux";
export {
  configureYtdlp,
  clearYtdlpCache,
  resolveYtdlp,
  requireYtdlpMessage,
  previewYtdlp,
  resolveYtdlpMedia,
} from "./providers/ytdlp";
export {
  youtubeQualityChoices,
  fragmentConcurrencyForQuality,
  qualityCap,
  qualityFromFormat,
} from "./providers/youtube/formats";
export { muxAvCopyArgs, muxAvRemuxArgs } from "./providers/youtube/muxArgs";
export { configurePinterestCookies, getPinterestCookieHeader } from "./providers/pinterest/session";
export { zipFolder } from "./zip/folderZip";
export {
  PRESETS,
  DEFAULT_ENHANCE_FEATURES,
  DEFAULT_YOUTUBE_OPTIONS,
  DEFAULT_PINTEREST_OPTIONS,
} from "./types";
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
  PinterestOptions,
} from "./types";

/* MediaCore — jobs, resume, tools, SDK */
export {
  MediaCore,
  getMediaCore,
  configureMediaCore,
  jobStatusToPackStatus,
  JobScheduler,
  runJobWorker,
} from "./engine";
export type {
  MediaCoreOptions,
  MediaCoreDownloadOptions,
  MediaCoreJobHandle,
  JobWorkerOptions,
} from "./engine";
export {
  JobManager,
  FileJobStore,
  createJobId,
  progressPercent,
  isActiveStatus,
  isUnfinishedStatus,
  isTerminalStatus,
  isRecoverableCrashStatus,
  canPause,
  canResume,
  canCancel,
} from "./jobs";
export type {
  JobStatus,
  JobProgress,
  JobFiles,
  JobFormat,
  DownloadJob,
  CreateJobInput,
  ListJobsFilter,
  CancelJobOptions,
  DownloadCheckpoint,
  SegmentCheckpoint,
  CheckpointType,
  JobStore,
  JobEvent,
  JobEventListener,
} from "./jobs";
export {
  downloadHlsResumable,
  fetchAndParseHls,
  parseM3u8,
  remuxSegmentFilesToMp4,
} from "./extractors";
export type { HlsExtractOptions, ParsedHlsPlaylist } from "./extractors";
export { ToolRegistry, tools } from "./tools";
export type { ToolName, ToolResolveResult } from "./tools";
export {
  FilesystemStorage,
  defaultMediaCoreRoot,
  ensureJobTempDir,
  jobWorkDir,
  partPathFor,
  checkpointPathFor,
  segmentsDirFor,
} from "./storage";

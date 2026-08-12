/**
 * @pinforge/providers — site providers, registry, extractors, media helpers.
 * Registration side effects: import "./sites" (ytdlp registered last).
 */
import "./sites";

/** Registry */
export { registerProvider, listProviders, getProvider, detectProvider } from "./registry";
export type { MediaProvider, ResolveContext } from "./registry/types";
export { ProviderNotImplementedError, ProviderNotFoundError } from "./registry/types";
export {
  CORE_ENGINE_FEATURES,
  featuresForProvider,
  PROVIDER_FEATURE_MATRIX,
  YOUTUBE_FEATURES,
  TIKTOK_FEATURES,
  FACEBOOK_FEATURES,
  INSTAGRAM_FEATURES,
  PINTEREST_FEATURES,
  YTDLP_FEATURES,
  STUB_FEATURES,
} from "./registry/capabilities";
export type {
  FeatureSupport,
  PlatformFeature,
  ProviderFeatureMatrix,
  CoreEngineFeature,
} from "./registry/capabilities";
export { registerProviderPlugin, listProviderPlugins, getProviderPlugin } from "./registry/plugin";
export type { ProviderPlugin, MediaInfo, RegisteredPluginInfo } from "./registry/plugin";

/** Pinterest */
export {
  resolvePin,
  resolveBoard,
  isBoardUrl,
  isProfileUrl,
  isPinterestCollectionUrl,
  isPinUrl,
  isPinterestUrl,
  classifyPinterestCollection,
  configurePinterestCookies,
  getPinterestCookieHeader,
} from "./sites/pinterest";

/** Site extractors */
export { extractYouTubeViaPiped as extractYouTube } from "./sites/youtube";
export { extractInstagram, extractInstagramInfo } from "./sites/instagram";
export { extractTikTok, extractTikTokInfo } from "./sites/tiktok";
export { extractFacebook, extractFacebookInfo, isFacebookUrl } from "./sites/facebook";

/** TikTok profile */
export {
  isTikTokProfileUrl,
  resolveTikTokProfile,
  normalizeTikTokProfileUrl,
  extractTikTokUsername,
} from "./sites/tiktok";
export type { TikTokProfileVideo, TikTokProfileResolveResult } from "./sites/tiktok";

/** YouTube channel / playlist / formats */
export {
  isYouTubeChannelUrl,
  resolveYouTubeChannel,
  detectYouTubeChannelTab,
  youtubeChannelRootUrl,
} from "./sites/youtube";
export type {
  YoutubeChannelVideo,
  YoutubeChannelResolveResult,
  YoutubeChannelTab,
} from "./sites/youtube";
export {
  isYouTubePlaylistUrl,
  isYouTubeMixPlaylistId,
  resolveYouTubePlaylist,
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  seedVideoIdFromMixPlaylistId,
} from "./sites/youtube";
export type { YoutubePlaylistVideo, YoutubePlaylistResolveResult } from "./sites/youtube";
export {
  youtubeQualityChoices,
  fragmentConcurrencyForQuality,
  qualityCap,
  qualityFromFormat,
} from "./sites/youtube";

/** Playwright scrape */
export { scrapePageMeta, fetchHtmlOrPlaywrightMeta, closePlaywrightBrowser } from "./extractors";
export type { PageMeta, ScrapeMetaOptions } from "./extractors";

/** yt-dlp catch-all */
export {
  configureYtdlp,
  clearYtdlpCache,
  resolveYtdlp,
  requireYtdlpMessage,
  resolveYtdlpMedia,
  previewYtdlp,
  ytdlpProvider,
  isHttpUrl,
} from "./sites/ytdlp";
export type { YtdlpResolveOpts, YtdlpPreview } from "./sites/ytdlp";

/** Cross-site media (ffmpeg) */
export { muxAvCopyArgs, muxAvRemuxArgs } from "./media";
export { configureFfmpeg, clearFfmpegCache, resolveFfmpeg } from "./media";

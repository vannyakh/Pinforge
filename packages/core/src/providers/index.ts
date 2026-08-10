import "./pinterest";
import "./extractorProviders";

export { registerProvider, listProviders, getProvider, detectProvider } from "./registry";
export type { MediaProvider, ResolveContext } from "./types";
export { ProviderNotImplementedError, ProviderNotFoundError } from "./types";
export {
  CORE_ENGINE_FEATURES,
  featuresForProvider,
  PROVIDER_FEATURE_MATRIX,
  YOUTUBE_FEATURES,
  TIKTOK_FEATURES,
  FACEBOOK_FEATURES,
  INSTAGRAM_FEATURES,
  PINTEREST_FEATURES,
  STUB_FEATURES,
} from "./capabilities";
export type {
  FeatureSupport,
  PlatformFeature,
  ProviderFeatureMatrix,
  CoreEngineFeature,
} from "./capabilities";
export {
  registerProviderPlugin,
  listProviderPlugins,
  getProviderPlugin,
} from "./plugin";
export type { ProviderPlugin, MediaInfo, RegisteredPluginInfo } from "./plugin";
export {
  resolvePin,
  resolveBoard,
  isBoardUrl,
  isProfileUrl,
  isPinterestCollectionUrl,
  isPinUrl,
  isPinterestUrl,
  classifyPinterestCollection,
} from "./pinterest";
export { extractYouTubeViaPiped as extractYouTube } from "./extractors/youtube";
export { extractInstagram, extractInstagramInfo } from "./extractors/instagram";
export { extractTikTok, extractTikTokInfo } from "./extractors/tiktok";
export { extractFacebook, extractFacebookInfo, isFacebookUrl } from "./extractors/facebook";
export {
  isTikTokProfileUrl,
  resolveTikTokProfile,
  normalizeTikTokProfileUrl,
  extractTikTokUsername,
} from "./tiktok/profile";
export type {
  TikTokProfileVideo,
  TikTokProfileResolveResult,
} from "./tiktok/profile";
export {
  isYouTubeChannelUrl,
  resolveYouTubeChannel,
  detectYouTubeChannelTab,
  youtubeChannelRootUrl,
} from "./youtube/channel";
export type {
  YoutubeChannelVideo,
  YoutubeChannelResolveResult,
  YoutubeChannelTab,
} from "./youtube/channel";
export {
  isYouTubePlaylistUrl,
  isYouTubeMixPlaylistId,
  resolveYouTubePlaylist,
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  seedVideoIdFromMixPlaylistId,
} from "./youtube/playlist";
export type { YoutubePlaylistVideo, YoutubePlaylistResolveResult } from "./youtube/playlist";
export {
  scrapePageMeta,
  fetchHtmlOrPlaywrightMeta,
  closePlaywrightBrowser,
} from "./extractors/playwrightMeta";
export type { PageMeta, ScrapeMetaOptions } from "./extractors/playwrightMeta";

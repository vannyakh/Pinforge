import "./pinterest";
import "./extractorProviders";
import "./stubs";

export { registerProvider, listProviders, getProvider, detectProvider } from "./registry";
export type { MediaProvider, ResolveContext } from "./types";
export { ProviderNotImplementedError, ProviderNotFoundError } from "./types";
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
export { extractInstagram } from "./extractors/instagram";
export { extractTikTok } from "./extractors/tiktok";
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

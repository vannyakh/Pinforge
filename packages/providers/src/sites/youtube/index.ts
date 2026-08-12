import type { MediaProvider } from "../../registry/types";
import { registerProvider } from "../../registry";
import { hostMatches } from "@pinforge/download";
import { YOUTUBE_FEATURES } from "../../registry/capabilities";
import { resolveYouTubeVideo } from "./service";

export * from "./formats";
export * from "./resume";
export { resolveYouTubeVideo, previewYouTubeVideo } from "./service";
export type { YoutubeResolveOpts, YoutubeVideoPreview } from "./service";
export {
  isYouTubeChannelUrl,
  resolveYouTubeChannel,
  detectYouTubeChannelTab,
  youtubeChannelRootUrl,
} from "./channel";
export type {
  YoutubeChannelVideo,
  YoutubeChannelResolveResult,
  YoutubeChannelTab,
} from "./channel";
export {
  isYouTubePlaylistUrl,
  isYouTubeMixPlaylistId,
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  seedVideoIdFromMixPlaylistId,
  resolveYouTubePlaylist,
} from "./playlist";
export type { YoutubePlaylistVideo, YoutubePlaylistResolveResult } from "./playlist";
export { extractYouTubeViaPiped, extractYouTubeId } from "./extract";

export const youtubeProvider: MediaProvider = {
  id: "youtube",
  label: "YouTube",
  live: true,
  formats: ["best", "mp4", "audio-only"],
  modes: ["single", "profile", "playlist"],
  features: YOUTUBE_FEATURES,
  match: (url) =>
    hostMatches(url, /^(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com|music\.youtube\.com)$/i),
  resolve: (url, ctx) =>
    resolveYouTubeVideo(url, {
      format: ctx?.format ?? "best",
      youtube: ctx?.youtube,
      outDir: ctx?.outDir,
      extractorUrl: ctx?.extractorUrl,
      fragmentConcurrency: ctx?.fragmentConcurrency,
      packFolders: ctx?.packFolders,
      naming: ctx?.naming,
      signal: ctx?.signal,
      onByteProgress: ctx?.onByteProgress,
    }),
};

registerProvider(youtubeProvider);

import type { MediaProvider } from "./types";
import { registerProvider } from "./registry";
import { hostMatches } from "./extractors/http";
import { resolveYouTubeVideo } from "./youtube/service";
import { extractInstagram } from "./extractors/instagram";
import { extractTikTok } from "./extractors/tiktok";
import { extractFacebook, isFacebookUrl } from "./extractors/facebook";
import {
  YOUTUBE_FEATURES,
  TIKTOK_FEATURES,
  INSTAGRAM_FEATURES,
  FACEBOOK_FEATURES,
} from "./capabilities";

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
      signal: ctx?.signal,
      onByteProgress: ctx?.onByteProgress,
    }),
};

export const instagramProvider: MediaProvider = {
  id: "instagram",
  label: "Instagram",
  live: true,
  formats: ["best", "mp4"],
  modes: ["single"],
  features: INSTAGRAM_FEATURES,
  match: (url) => hostMatches(url, /^(www\.)?(instagram\.com|instagr\.am)$/i),
  resolve: (url, ctx) =>
    extractInstagram(url, ctx?.format === "audio-only" ? "best" : (ctx?.format ?? "best"), {
      fragmentConcurrency: ctx?.fragmentConcurrency,
      signal: ctx?.signal,
    }),
};

export const tiktokProvider: MediaProvider = {
  id: "tiktok",
  label: "TikTok",
  live: true,
  formats: ["best", "mp4"],
  modes: ["single", "profile"],
  features: TIKTOK_FEATURES,
  match: (url) => hostMatches(url, /^(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)$/i),
  resolve: (url, ctx) =>
    extractTikTok(url, ctx?.format === "audio-only" ? "best" : (ctx?.format ?? "best"), {
      fragmentConcurrency: ctx?.fragmentConcurrency,
      signal: ctx?.signal,
    }),
};

export const facebookProvider: MediaProvider = {
  id: "facebook",
  label: "Facebook",
  live: true,
  formats: ["best", "mp4"],
  modes: ["single"],
  features: FACEBOOK_FEATURES,
  match: (url) => isFacebookUrl(url),
  resolve: (url, ctx) =>
    extractFacebook(url, ctx?.format === "audio-only" ? "best" : (ctx?.format ?? "best"), {
      fragmentConcurrency: ctx?.fragmentConcurrency,
      signal: ctx?.signal,
    }),
};

registerProvider(youtubeProvider);
registerProvider(instagramProvider);
registerProvider(tiktokProvider);
registerProvider(facebookProvider);

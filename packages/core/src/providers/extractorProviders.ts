import type { MediaProvider } from "./types";
import { registerProvider } from "./registry";
import { hostMatches } from "./extractors/http";
import { extractYouTubeViaPiped } from "./extractors/youtube";
import { extractInstagram } from "./extractors/instagram";
import { extractTikTok } from "./extractors/tiktok";

export const youtubeProvider: MediaProvider = {
  id: "youtube",
  label: "YouTube",
  live: true,
  formats: ["best", "mp4", "audio-only"],
  modes: ["single"],
  match: (url) =>
    hostMatches(url, /^(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com|music\.youtube\.com)$/i),
  resolve: (url, ctx) =>
    extractYouTubeViaPiped(url, {
      format: ctx?.format ?? "best",
      extractorUrl: ctx?.extractorUrl,
      fragmentConcurrency: ctx?.fragmentConcurrency,
      signal: ctx?.signal,
    }),
};

export const instagramProvider: MediaProvider = {
  id: "instagram",
  label: "Instagram",
  live: true,
  formats: ["best", "mp4"],
  modes: ["single"],
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
  modes: ["single"],
  match: (url) => hostMatches(url, /^(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)$/i),
  resolve: (url, ctx) =>
    extractTikTok(url, ctx?.format === "audio-only" ? "best" : (ctx?.format ?? "best"), {
      fragmentConcurrency: ctx?.fragmentConcurrency,
      signal: ctx?.signal,
    }),
};

registerProvider(youtubeProvider);
registerProvider(instagramProvider);
registerProvider(tiktokProvider);

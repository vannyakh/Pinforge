import type { MediaProvider } from "../../registry/types";
import { registerProvider } from "../../registry";
import { hostMatches } from "@pinforge/download";
import { TIKTOK_FEATURES } from "../../registry/capabilities";
import { extractTikTok } from "./extract";

export { extractTikTok, extractTikTokInfo } from "./extract";
export {
  isTikTokProfileUrl,
  resolveTikTokProfile,
  normalizeTikTokProfileUrl,
  extractTikTokUsername,
} from "./profile";
export type { TikTokProfileVideo, TikTokProfileResolveResult } from "./profile";

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

registerProvider(tiktokProvider);

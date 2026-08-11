import type { MediaProvider } from "../../registry/types";
import { registerProvider } from "../../registry";
import { hostMatches } from "@pinforge/download";
import { INSTAGRAM_FEATURES } from "../../registry/capabilities";
import { extractInstagram } from "./extract";

export { extractInstagram, extractInstagramInfo } from "./extract";

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

registerProvider(instagramProvider);

import type { MediaProvider } from "../../registry/types";
import { registerProvider } from "../../registry";
import { FACEBOOK_FEATURES } from "../../registry/capabilities";
import { extractFacebook, isFacebookUrl } from "./extract";

export {
  extractFacebook,
  extractFacebookInfo,
  isFacebookUrl,
  isFacebookProfileUrl,
} from "./extract";

export const facebookProvider: MediaProvider = {
  id: "facebook",
  label: "Facebook",
  live: true,
  formats: ["best", "mp4"],
  modes: ["single", "profile"],
  features: FACEBOOK_FEATURES,
  match: (url) => isFacebookUrl(url),
  resolve: (url, ctx) =>
    extractFacebook(url, ctx?.format === "audio-only" ? "best" : (ctx?.format ?? "best"), {
      fragmentConcurrency: ctx?.fragmentConcurrency,
      signal: ctx?.signal,
    }),
};

registerProvider(facebookProvider);

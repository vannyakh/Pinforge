import type { MediaProvider } from "../../registry/types";
import { registerProvider } from "../../registry";
import { YTDLP_FEATURES } from "../../registry/capabilities";
import { isHttpUrl } from "@pinforge/common";
import { resolveYtdlpMedia } from "./resolve";

export {
  configureYtdlp,
  clearYtdlpCache,
  resolveYtdlp,
  requireYtdlpMessage,
} from "@pinforge/tools";
export { buildYtdlpDownloadArgs, buildYtdlpProbeArgs, ytdlpFormatSelector } from "./args";
export { isHttpUrl } from "@pinforge/common";
export { resolveYtdlpMedia, previewYtdlp } from "./resolve";
export type { YtdlpResolveOpts, YtdlpPreview } from "./resolve";

/**
 * Catch-all provider for http(s) URLs not handled by built-in extractors.
 * Must be registered last — detectProvider is first-match-wins.
 */
export const ytdlpProvider: MediaProvider = {
  id: "ytdlp",
  label: "yt-dlp",
  live: true,
  formats: ["best", "mp4", "audio-only"],
  modes: ["single"],
  features: YTDLP_FEATURES,
  match: (url) => isHttpUrl(url),
  resolve: (url, ctx) =>
    resolveYtdlpMedia(url, {
      format: ctx?.format ?? "best",
      quality: ctx?.youtube?.quality,
      outDir: ctx?.outDir,
      signal: ctx?.signal,
      onByteProgress: ctx?.onByteProgress,
    }),
};

registerProvider(ytdlpProvider);

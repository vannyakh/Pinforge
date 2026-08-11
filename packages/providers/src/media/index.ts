/**
 * Cross-site ffmpeg mux helpers (used by YouTube, Pinterest HLS, yt-dlp).
 */

export { muxAvCopyArgs, muxAvRemuxArgs } from "./muxArgs";
export {
  configureFfmpeg,
  clearFfmpegCache,
  resolveFfmpeg,
  requireFfmpegMessage,
  remuxHlsToMp4,
  muxAv,
  convertAudio,
  embedMetadata,
} from "./mux";

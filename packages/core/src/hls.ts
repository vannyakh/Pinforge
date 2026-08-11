/** Façade re-export. */
export {
  parseM3u8,
  fetchAndParseHls,
  downloadHlsResumable,
  remuxSegmentFilesToMp4,
} from "@pinforge/download/hls";
export type {
  HlsExtractOptions,
  ParsedHlsPlaylist,
  Extractor,
  ExtractorKind,
  ExtractorContext,
} from "@pinforge/download/hls";

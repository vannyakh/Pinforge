/** Re-export shared HTTP helpers — prefer `@pinforge/download` http surface. */
export {
  EXTRACTOR_HEADERS,
  hostMatches,
  fetchText,
  fetchBinary,
  extFromUrlOrType,
  metaContent,
  kindFromExt,
  toResolved,
} from "@pinforge/download";

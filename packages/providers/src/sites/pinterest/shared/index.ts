/**
 * Shared Pinterest helpers — URLs, session, pinimg CDN, PinResource, video pick.
 */

export {
  expandPinterestUrl,
  extractPinIdFromUrl,
  isBarePinId,
  isPinItHost,
  isPinUrl,
  isPinterestHost,
  isPinterestUrl,
  normalizePinUrl,
  parsePinInput,
  pinUrlFromId,
} from "./urls";
export type { ParsedPinInput } from "./urls";

export {
  configurePinterestCookies,
  getPinterestCookieHeader,
  pinterestApiHeaders,
  pinterestCsrfToken,
  pinterestRequestHeaders,
  pinterestTraceId,
  PINTEREST_USER_AGENT,
} from "./session";

export {
  coverFromImageSignature,
  coverFromPinimg,
  coverFromPinObject,
  firstPinimgIn,
  imageUrlFromImagesMap,
  sanitizeMediaUrl,
  toGridCoverUrl,
  toOriginalsUrl,
} from "./pinimg";

export { fetchPinMeta, fetchPinResource } from "./pinResource";
export type { FetchPinResourceOpts } from "./pinResource";

export { extractVideoList, pickBestVideo, pickPinterestVideoUrl } from "./video";

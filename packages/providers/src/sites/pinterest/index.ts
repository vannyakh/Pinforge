import type { MediaProvider } from "../../registry/types";
import type { ResolvedMedia } from "@pinforge/types";
import { resolvePin } from "./resolvePin";
import { isPinterestCollectionUrl, isPinterestUrl } from "./resolveBoard";
import { registerProvider } from "../../registry";
import { PINTEREST_FEATURES } from "../../registry/capabilities";

export const pinterestProvider: MediaProvider = {
  id: "pinterest",
  label: "Pinterest",
  live: true,
  formats: ["best"],
  modes: ["single", "board", "profile"],
  features: PINTEREST_FEATURES,
  match: (url) => isPinterestUrl(url),
  async resolve(url: string): Promise<ResolvedMedia | ResolvedMedia[]> {
    if (isPinterestCollectionUrl(url)) {
      throw new Error(
        "Pinterest board/profile/search downloads use the batch process path (processMedia)."
      );
    }

    const assetOrList = await resolvePin(url);
    const assets = Array.isArray(assetOrList) ? assetOrList : [assetOrList];
    const mapped = assets.map((asset) => ({
      kind: asset.kind ?? ("image" as const),
      buffer: asset.buffer,
      ext: asset.ext,
      sourceUrl: asset.sourceUrl,
      title: asset.title,
      provider: "pinterest" as const,
      id: asset.pinId,
    }));
    return mapped.length === 1 ? mapped[0]! : mapped;
  },
};

registerProvider(pinterestProvider);

/** Resolvers */
export { resolvePin } from "./resolvePin";
export {
  resolveBoard,
  isBoardUrl,
  isProfileUrl,
  isPinterestCollectionUrl,
  classifyPinterestCollection,
  isMultiPinShareUrl,
  parseMultiPinShare,
  resolveMultiPinShare,
} from "./resolveBoard";
export type { ResolveBoardOptions } from "./resolveBoard";

/** Shared helpers (urls, session, pinimg, video, PinResource) */
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
  configurePinterestCookies,
  getPinterestCookieHeader,
  pinterestApiHeaders,
  pinterestRequestHeaders,
  PINTEREST_USER_AGENT,
  coverFromPinimg,
  coverFromPinObject,
  imageUrlFromImagesMap,
  sanitizeMediaUrl,
  toGridCoverUrl,
  toOriginalsUrl,
  fetchPinMeta,
  fetchPinResource,
  extractVideoList,
  pickBestVideo,
  pickPinterestVideoUrl,
} from "./shared";
export type { ParsedPinInput, FetchPinResourceOpts } from "./shared";

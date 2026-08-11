import type { MediaProvider } from "../types";
import type { ResolvedMedia } from "@pinforge/types";
import { resolvePin } from "./resolvePin";
import { isPinterestCollectionUrl, isPinterestUrl } from "./resolveBoard";
import { registerProvider } from "../registry";
import { PINTEREST_FEATURES } from "../capabilities";

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

export { resolvePin } from "./resolvePin";
export {
  resolveBoard,
  isBoardUrl,
  isProfileUrl,
  isPinterestCollectionUrl,
  isPinUrl,
  isPinterestUrl,
  classifyPinterestCollection,
} from "./resolveBoard";
export type { ResolveBoardOptions } from "./resolveBoard";
export {
  configurePinterestCookies,
  getPinterestCookieHeader,
  pinterestRequestHeaders,
} from "./session";

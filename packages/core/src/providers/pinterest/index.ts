import type { MediaProvider } from "../types";
import type { ResolvedMedia } from "../../types";
import { resolvePin } from "./resolvePin";
import { isPinterestCollectionUrl, isPinterestUrl } from "./resolveBoard";
import { registerProvider } from "../registry";

export const pinterestProvider: MediaProvider = {
  id: "pinterest",
  label: "Pinterest",
  live: true,
  formats: ["best"],
  modes: ["single", "board", "profile"],
  match: (url) => isPinterestUrl(url),
  async resolve(url: string): Promise<ResolvedMedia | ResolvedMedia[]> {
    if (isPinterestCollectionUrl(url)) {
      throw new Error(
        "Pinterest board/profile/search downloads use the batch process path (processMedia)."
      );
    }

    const asset = await resolvePin(url);
    return {
      kind: asset.kind ?? "image",
      buffer: asset.buffer,
      ext: asset.ext,
      sourceUrl: asset.sourceUrl,
      title: asset.title,
      provider: "pinterest",
      id: asset.pinId,
    };
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

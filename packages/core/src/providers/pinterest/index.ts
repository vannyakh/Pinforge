import type { MediaProvider } from "../types";
import type { ResolvedMedia } from "../../types";
import { resolvePin } from "./resolvePin";
import { isBoardUrl, isPinterestUrl, resolveBoard } from "./resolveBoard";
import { registerProvider } from "../registry";
import { sleep } from "../../utils";

export const pinterestProvider: MediaProvider = {
  id: "pinterest",
  label: "Pinterest",
  live: true,
  formats: ["best"],
  match: (url) => isPinterestUrl(url),
  async resolve(url: string): Promise<ResolvedMedia | ResolvedMedia[]> {
    if (isBoardUrl(url)) {
      const { pinUrls } = await resolveBoard(url);
      // Return pin URL list as resolved items one-by-one would be heavy;
      // processMedia will handle board via dedicated path — here resolve first pin page list meta only.
      // For provider.resolve on boards, resolve all pins (caller may rate-limit).
      const items: ResolvedMedia[] = [];
      for (let i = 0; i < pinUrls.length; i++) {
        const asset = await resolvePin(pinUrls[i]!);
        items.push({
          kind: asset.kind ?? "image",
          buffer: asset.buffer,
          ext: asset.ext,
          sourceUrl: asset.sourceUrl,
          title: asset.title,
          provider: "pinterest",
        });
        if (i < pinUrls.length - 1) await sleep(800);
      }
      return items;
    }

    const asset = await resolvePin(url);
    return {
      kind: asset.kind ?? "image",
      buffer: asset.buffer,
      ext: asset.ext,
      sourceUrl: asset.sourceUrl,
      title: asset.title,
      provider: "pinterest",
    };
  },
};

registerProvider(pinterestProvider);

export { resolvePin } from "./resolvePin";
export { resolveBoard, isBoardUrl, isPinUrl, isPinterestUrl } from "./resolveBoard";

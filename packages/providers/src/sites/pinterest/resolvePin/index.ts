import type { PinAsset } from "@pinforge/types";
import { resolveFfmpeg } from "../../../media/mux";
import { toOriginalsUrl } from "../shared/pinimg";
import { fetchPinResource } from "../shared/pinResource";
import { pinterestRequestHeaders } from "../shared/session";
import { expandPinterestUrl, extractPinIdFromUrl } from "../shared/urls";
import { downloadBinary, downloadHlsAsMp4, resolveBestImageUrl } from "./download";
import { extractFromPinObject, extractOgFallback, findPinInHtml } from "./extractPin";
import { fetchOembed } from "./oembed";

export { pickPinterestVideoUrl } from "../shared/video";
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
} from "../shared/urls";

/**
 * Resolve a pin URL to original image(s) or best video buffer.
 * Accepts full pin URLs, pin.it shorts, and bare pin ids.
 * Carousel pins return one PinAsset per slot.
 */
export async function resolvePin(url: string): Promise<PinAsset | PinAsset[]> {
  const pinUrl = await expandPinterestUrl(url);
  const pinId = extractPinIdFromUrl(pinUrl);
  if (!pinId) throw new Error("Not a Pinterest pin URL");

  const allowHls = Boolean(await resolveFfmpeg());

  let imageUrl: string | null = null;
  let videoUrl: string | null = null;
  let title: string | undefined;
  let fallbacks: string[] = [];
  let carouselImages: string[] = [];
  let html = "";
  let appVersion: string | undefined;

  try {
    const pageRes = await fetch(pinUrl, {
      headers: pinterestRequestHeaders(),
      redirect: "follow",
    });
    if (pageRes.ok) {
      html = await pageRes.text();
      appVersion =
        html.match(/"app_version"\s*:\s*"([^"]+)"/)?.[1] ||
        html.match(/"appVersion"\s*:\s*"([^"]+)"/)?.[1];
      const pin = findPinInHtml(html, pinId);
      if (pin) {
        const extracted = extractFromPinObject(pin, allowHls);
        imageUrl = extracted.imageUrl;
        videoUrl = extracted.videoUrl;
        title = extracted.title;
        fallbacks = extracted.fallbacks;
        carouselImages = extracted.carouselImages ?? [];
      }
    }
  } catch {
    /* API / playwright below */
  }

  if (!imageUrl && !videoUrl) {
    try {
      const pin = await fetchPinResource(pinId, { appVersion });
      if (pin) {
        const extracted = extractFromPinObject(pin, allowHls);
        imageUrl = extracted.imageUrl;
        videoUrl = extracted.videoUrl;
        title = title || extracted.title;
        fallbacks = extracted.fallbacks;
        if (extracted.carouselImages?.length) carouselImages = extracted.carouselImages;
      }
    } catch {
      /* fall through */
    }
  }

  if (imageUrl && !/\/originals\//i.test(imageUrl)) {
    try {
      const pin = await fetchPinResource(pinId, { appVersion });
      if (pin) {
        const extracted = extractFromPinObject(pin, allowHls);
        if (
          extracted.videoUrl ||
          (extracted.imageUrl && /\/originals\//i.test(extracted.imageUrl))
        ) {
          imageUrl = extracted.imageUrl;
          videoUrl = extracted.videoUrl;
          title = title || extracted.title;
          fallbacks = [...extracted.fallbacks, ...fallbacks];
        }
        if (extracted.carouselImages?.length) carouselImages = extracted.carouselImages;
      }
    } catch {
      /* keep HTML result */
    }
  }

  if (!imageUrl && !videoUrl && html) {
    const og = extractOgFallback(html);
    imageUrl = og.imageUrl;
    videoUrl = og.videoUrl && (allowHls || !/\.m3u8/i.test(og.videoUrl)) ? og.videoUrl : null;
    title = title || og.title;
  }

  if (!imageUrl && !videoUrl) {
    const oe = await fetchOembed(pinId);
    if (oe.imageUrl) {
      imageUrl = oe.imageUrl;
      title = title || oe.title;
      fallbacks.push(oe.imageUrl.replace(/\/originals\//, "/736x/"));
    } else if (oe.title) {
      title = title || oe.title;
    }
  }

  if (!imageUrl && !videoUrl) {
    const { scrapePageMeta } = await import("../../../extractors/playwrightMeta");
    const meta = await scrapePageMeta(pinUrl, {
      referer: "https://www.pinterest.com/",
      settleMs: 1200,
    });
    const pin = findPinInHtml(meta.html, pinId);
    if (pin) {
      const extracted = extractFromPinObject(pin, allowHls);
      imageUrl = extracted.imageUrl;
      videoUrl = extracted.videoUrl;
      title = title || extracted.title;
      fallbacks = extracted.fallbacks;
    }
    if (!imageUrl && !videoUrl) {
      const og = extractOgFallback(meta.html);
      imageUrl = og.imageUrl || meta.ogImage || null;
      if (imageUrl) imageUrl = toOriginalsUrl(imageUrl);
      videoUrl =
        og.videoUrl ||
        meta.ogVideo ||
        meta.videos.find((v) => /\.mp4/i.test(v)) ||
        (allowHls ? meta.videos.find((v) => /\.m3u8/i.test(v)) : undefined) ||
        null;
      title = title || og.title || meta.ogTitle || meta.title;
    }
  }

  if (videoUrl && /\.m3u8(\?|$)/i.test(videoUrl) && !allowHls) {
    videoUrl = null;
  }

  if (videoUrl) {
    try {
      if (/\.m3u8(\?|$)/i.test(videoUrl)) {
        const { buffer, ext } = await downloadHlsAsMp4(videoUrl);
        return { buffer, ext, sourceUrl: videoUrl, title, kind: "video", pinId };
      }
      const { buffer, ext } = await downloadBinary(videoUrl, "video/mp4,video/*,*/*;q=0.8");
      return {
        buffer,
        ext: ext === "jpg" ? "mp4" : ext,
        sourceUrl: videoUrl,
        title,
        kind: "video",
        pinId,
      };
    } catch (err) {
      if (!imageUrl && fallbacks[0]) imageUrl = fallbacks[0];
      if (!imageUrl) throw err;
    }
  }

  if (!imageUrl) {
    throw new Error(
      allowHls
        ? "Could not find media on this pin. Make sure it is public or cookies are set in Settings."
        : "Could not find media on this pin. Enable ffmpeg for HLS video pins, or set cookies for private pins."
    );
  }

  const slots = carouselImages.length > 1 ? carouselImages : [imageUrl];
  const assets: PinAsset[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slotUrl = slots[i]!;
    const finalImage = await resolveBestImageUrl(slotUrl, [
      ...fallbacks,
      slotUrl.replace(/\/originals\//, "/1200x/"),
      slotUrl.replace(/\/originals\//, "/736x/"),
    ]);
    const { buffer, ext } = await downloadBinary(
      finalImage,
      "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    );
    assets.push({
      buffer,
      ext,
      sourceUrl: finalImage,
      title: slots.length > 1 ? `${title ?? "pin"} (${i + 1})` : title,
      kind: "image",
      pinId: slots.length > 1 ? `${pinId}_${i}` : pinId,
    });
  }

  return assets.length === 1 ? assets[0]! : assets;
}

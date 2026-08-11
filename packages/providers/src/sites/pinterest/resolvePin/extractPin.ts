import { imageUrlFromImagesMap, sanitizeMediaUrl, toOriginalsUrl } from "../shared/pinimg";
import { extractVideoList, pickBestVideo, pickPinterestVideoUrl } from "../shared/video";

function titleFromPin(pin: Record<string, unknown>): string | undefined {
  for (const key of [
    "grid_title",
    "title",
    "closeup_unified_description",
    "closeup_description",
    "description",
  ]) {
    const v = pin[key];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
  }
  return undefined;
}

export interface PinObjectExtract {
  imageUrl: string | null;
  videoUrl: string | null;
  title?: string;
  fallbacks: string[];
  carouselImages?: string[];
}

export function extractFromPinObject(
  pin: Record<string, unknown>,
  allowHls: boolean
): PinObjectExtract {
  const title = titleFromPin(pin);
  const fallbacks: string[] = [];

  const story = pin.story_pin_data;
  if (story && typeof story === "object") {
    const pages = (story as { pages?: unknown[] }).pages;
    if (Array.isArray(pages)) {
      for (const page of pages) {
        if (!page || typeof page !== "object") continue;
        const blocks = (page as { blocks?: unknown[] }).blocks;
        if (!Array.isArray(blocks)) continue;
        for (const block of blocks) {
          if (!block || typeof block !== "object") continue;
          const b = block as Record<string, unknown>;
          if (b.video && typeof b.video === "object") {
            const videoUrl = pickPinterestVideoUrl(b.video, allowHls);
            if (videoUrl) return { imageUrl: null, videoUrl, title, fallbacks };
          }
          if (b.videoDataV2 || b.video_list || b.videos) {
            const videoUrl = pickPinterestVideoUrl(
              b.videoDataV2 ?? b.videos ?? { video_list: b.video_list },
              allowHls
            );
            if (videoUrl) return { imageUrl: null, videoUrl, title, fallbacks };
          }
          const img = imageUrlFromImagesMap(
            (b.image as { images?: unknown } | undefined)?.images ?? b.images
          );
          if (img) return { imageUrl: img, videoUrl: null, title, fallbacks };
        }
      }
    }
  }

  const carousel = pin.carousel_data;
  if (carousel && typeof carousel === "object") {
    const slots = (carousel as { carousel_slots?: unknown[] }).carousel_slots;
    if (Array.isArray(slots) && slots.length) {
      const carouselImages: string[] = [];
      for (const raw of slots) {
        if (!raw || typeof raw !== "object") continue;
        const slot = raw as { images?: unknown; videos?: unknown };
        if (slot.videos) {
          const videoUrl = pickBestVideo(extractVideoList(slot.videos, allowHls), allowHls);
          if (videoUrl && !carouselImages.length) {
            return { imageUrl: null, videoUrl, title, fallbacks, carouselImages: [] };
          }
        }
        const img = imageUrlFromImagesMap(slot.images);
        if (img) carouselImages.push(img);
      }
      if (carouselImages.length === 1) {
        return { imageUrl: carouselImages[0]!, videoUrl: null, title, fallbacks };
      }
      if (carouselImages.length > 1) {
        return {
          imageUrl: carouselImages[0]!,
          videoUrl: null,
          title,
          fallbacks,
          carouselImages,
        };
      }
    }
  }

  if (pin.videos) {
    const videoUrl = pickPinterestVideoUrl(pin.videos, allowHls);
    if (videoUrl) {
      const cover = imageUrlFromImagesMap(pin.images);
      if (cover) fallbacks.push(cover);
      return { imageUrl: null, videoUrl, title, fallbacks };
    }
  }

  const imageUrl = imageUrlFromImagesMap(pin.images);
  if (imageUrl) {
    const m = imageUrl.match(
      /^(https?:\/\/i\.pinimg\.com\/originals\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]+)(?:\.(jpe?g|png|webp))?/i
    );
    if (m) {
      const base = m[1];
      for (const ext of ["jpg", "png", "webp"]) {
        const cand = `${base}.${ext}`;
        if (cand !== imageUrl) fallbacks.push(cand);
      }
    }
    const sized = imageUrl.replace(/\/originals\//, "/736x/");
    if (sized !== imageUrl) fallbacks.push(sized);
    return { imageUrl, videoUrl: null, title, fallbacks };
  }

  return { imageUrl: null, videoUrl: null, title, fallbacks };
}

export function findPinInHtml(html: string, pinId: string): Record<string, unknown> | null {
  const blobs = [
    ...html.matchAll(/<script[^>]*id=["']__PWS_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(
      /<script[^>]*data-relay-response=["']true["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  for (const m of blobs) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const found = findPinNode(JSON.parse(raw), pinId, 0);
      if (found) return found;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function findPinNode(node: unknown, pinId: string, depth: number): Record<string, unknown> | null {
  if (depth > 16 || node == null) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findPinNode(item, pinId, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  const id = obj.id ?? obj.pin_id ?? obj.pinId;
  if (
    String(id) === pinId &&
    (obj.images || obj.videos || obj.story_pin_data || obj.carousel_data)
  ) {
    return obj;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const hit = findPinNode(v, pinId, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

export function extractOgFallback(html: string): {
  imageUrl: string | null;
  videoUrl: string | null;
  title?: string;
} {
  const imageCandidates: string[] = [];
  const videoCandidates: string[] = [];
  let title: string | undefined;

  const ogVideo =
    html.match(/<meta[^>]+property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::url)?["']/i);
  if (ogVideo?.[1]) videoCandidates.push(sanitizeMediaUrl(ogVideo[1]));

  const ogMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch?.[1]) imageCandidates.push(toOriginalsUrl(ogMatch[1]));

  const titleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) title = titleMatch[1].replace(/\s*[|\-–].*$/, "").trim();

  const videoUrl =
    videoCandidates.find((u) => /\.mp4/i.test(u)) ||
    videoCandidates.find((u) => /\.m3u8/i.test(u)) ||
    null;
  return { imageUrl: imageCandidates[0] ?? null, videoUrl, title };
}

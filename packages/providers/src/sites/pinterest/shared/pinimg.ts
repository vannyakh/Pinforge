/**
 * pinimg.com URL helpers — unescape, size rewrite, originals vs grid covers.
 */

import { cleanUrl } from "@pinforge/common";

/** Trim junk pasted after a CDN URL (CSS, JSON delimiters, etc.). */
export function sanitizeMediaUrl(raw: string): string {
  let u = cleanUrl(raw);
  if (u.startsWith("//")) u = `https:${u}`;
  const cut = u.search(/["'\s<>)}\\]|,(?=["'])/);
  if (cut > 0) u = u.slice(0, cut);
  const extMatch = u.match(
    /^(https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png|webp|gif|mp4|webm|m3u8))(?:[?#][^\s"'<>]*)?/i
  );
  if (extMatch) return extMatch[0];
  return u.replace(/[)}\];,]+$/g, "");
}

/** Upgrade sized pinimg paths to /originals/ for download. */
export function toOriginalsUrl(url: string): string {
  return sanitizeMediaUrl(url)
    .replace(/\/\d+x\d*\//, "/originals/")
    .replace(/\/\d+x\//, "/originals/");
}

/**
 * Mid-size grid cover for UI previews (originals often fail in &lt;img&gt;).
 */
export function toGridCoverUrl(raw: string): string | undefined {
  let u = sanitizeMediaUrl(raw);
  const clipped = u.match(/^(https?:\/\/(?:i\.)?pinimg\.com\/[^\s"'<>)\\{}]+)/i);
  if (!clipped?.[1]) return undefined;
  u = clipped[1].replace(/[,;]+$/, "");
  u = u
    .replace(/\/75x75(?:_RS)?\//i, "/474x/")
    .replace(/\/originals\//i, "/474x/")
    .replace(/\/1200x\//i, "/474x/");
  if (!/^https?:\/\//i.test(u)) return undefined;
  return u;
}

/** Alias used by board listing code. */
export const coverFromPinimg = toGridCoverUrl;

/** Build a grid thumbnail from Pinterest image_signature when images{} is missing. */
export function coverFromImageSignature(sig: unknown): string | undefined {
  if (typeof sig !== "string") return undefined;
  const s = sig.trim().toLowerCase();
  if (!/^[0-9a-f]{16,}$/.test(s)) return undefined;
  const a = s.slice(0, 2);
  const b = s.slice(2, 4);
  const c = s.slice(4, 6);
  return `https://i.pinimg.com/236x/${a}/${b}/${c}/${s}.jpg`;
}

export function firstPinimgIn(value: unknown, depth = 0): string | undefined {
  if (depth > 8 || value == null) return undefined;
  if (typeof value === "string") {
    if (/pinimg\.com/i.test(value)) return toGridCoverUrl(value);
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = firstPinimgIn(item, depth + 1);
      if (hit) return hit;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  for (const key of ["url", "thumbnail", "thumbnail_url", "image_url", "src", "cover_image_url"]) {
    const v = obj[key];
    if (typeof v === "string" && /pinimg\.com/i.test(v)) {
      const cover = toGridCoverUrl(v);
      if (cover) return cover;
    }
  }
  for (const v of Object.values(obj)) {
    const hit = firstPinimgIn(v, depth + 1);
    if (hit) return hit;
  }
  return undefined;
}

/** Prefer originals for download. */
export function imageUrlFromImagesMap(images: unknown): string | null {
  if (!images || typeof images !== "object") return null;
  const map = images as Record<string, { url?: string } | string>;
  const order = ["orig", "originals", "1200x", "736x", "564x", "474x", "236x"];
  for (const key of order) {
    const slot = map[key];
    const u =
      typeof slot === "string" ? slot : slot && typeof slot === "object" ? slot.url : undefined;
    if (typeof u === "string" && /pinimg\.com/i.test(u)) {
      return key === "orig" || key === "originals" ? sanitizeMediaUrl(u) : toOriginalsUrl(u);
    }
  }
  for (const slot of Object.values(map)) {
    const u =
      typeof slot === "string" ? slot : slot && typeof slot === "object" ? slot.url : undefined;
    if (typeof u === "string" && /pinimg\.com/i.test(u)) return toOriginalsUrl(u);
  }
  return null;
}

/** Prefer mid-size for board/grid UI covers. */
export function coverFromPinObject(obj: Record<string, unknown>): string | undefined {
  const images = obj.images;
  if (images && typeof images === "object") {
    const imgMap = images as Record<string, { url?: string } | string>;
    const order = ["474x", "736x", "564x", "236x", "orig", "originals", "170x", "150x150"];
    for (const key of order) {
      const slot = imgMap[key];
      const u =
        typeof slot === "string" ? slot : slot && typeof slot === "object" ? slot.url : undefined;
      if (typeof u === "string") {
        const cover = toGridCoverUrl(u);
        if (cover) return cover;
      }
    }
    const any = firstPinimgIn(images);
    if (any) return any;
  }

  for (const key of [
    "image_medium_url",
    "image_large_url",
    "image_small_url",
    "image_square_url",
    "cover_image_url",
    "thumbnail_url",
  ]) {
    const v = obj[key];
    if (typeof v === "string") {
      const cover = toGridCoverUrl(v);
      if (cover) return cover;
    }
  }

  const fromSig = coverFromImageSignature(obj.image_signature);
  if (fromSig) return fromSig;

  for (const key of ["videos", "story_pin_data", "rich_summary", "embed"]) {
    const hit = firstPinimgIn(obj[key]);
    if (hit) return hit;
  }

  return undefined;
}

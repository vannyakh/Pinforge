import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PinAsset } from "../../types";
import { downloadToBuffer } from "../../download/fragment";
import { remuxHlsToMp4, resolveFfmpeg } from "../youtube/mux";
import { pinterestCsrfToken, pinterestRequestHeaders } from "./session";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** @deprecated Prefer getPinterestFetchHeaders() so cookies apply. */
export const FETCH_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export function getPinterestFetchHeaders(): Record<string, string> {
  return pinterestRequestHeaders();
}

export function isPinterestHost(hostname: string): boolean {
  return /pinterest\.(com|co\.\w+|ca|fr|de|jp|kr|com\.\w+)$/i.test(hostname);
}

export function normalizePinUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!isPinterestHost(parsed.hostname)) {
    throw new Error("URL must be a pinterest.com pin or board link");
  }

  const pinMatch = parsed.pathname.match(/\/pin\/(\d+)/);
  if (pinMatch) {
    return `https://www.pinterest.com/pin/${pinMatch[1]}/`;
  }

  return parsed.href;
}

function extFromContentType(ct: string | null, url: string): string {
  if (ct?.includes("mp4") || ct?.includes("video")) return "mp4";
  if (ct?.includes("webm")) return "webm";
  if (ct?.includes("png")) return "png";
  if (ct?.includes("webp")) return "webp";
  if (ct?.includes("gif")) return "gif";
  if (ct?.includes("jpeg") || ct?.includes("jpg")) return "jpg";
  const fromUrl = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (fromUrl && ["jpg", "jpeg", "png", "webp", "gif", "mp4", "webm", "m3u8"].includes(fromUrl)) {
    return fromUrl === "jpeg" ? "jpg" : fromUrl === "m3u8" ? "mp4" : fromUrl;
  }
  return "jpg";
}

/** Trim junk pasted after a pinimg URL (CSS, JSON delimiters, etc.). */
function sanitizeMediaUrl(raw: string): string {
  let u = raw.replace(/\\\//g, "/").replace(/\\u002F/g, "/").replace(/\\u0026/g, "&").trim();
  const cut = u.search(/["'\s<>)}\\]|,(?=["'])/);
  if (cut > 0) u = u.slice(0, cut);
  const extMatch = u.match(
    /^(https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png|webp|gif|mp4|webm|m3u8))(?:[?#][^\s"'<>]*)?/i
  );
  if (extMatch) return extMatch[0];
  return u.replace(/[)}\];,]+$/g, "");
}

function toOriginalsUrl(url: string): string {
  return sanitizeMediaUrl(url)
    .replace(/\/\d+x\d*\//, "/originals/")
    .replace(/\/\d+x\//, "/originals/");
}

type VideoCandidate = { url: string; width: number; height: number; hls: boolean };

function extractVideoList(videos: unknown, allowHls: boolean): VideoCandidate[] {
  if (!videos || typeof videos !== "object") return [];
  const root = videos as Record<string, unknown>;
  const list =
    (root.video_list as Record<string, unknown> | undefined) ??
    (root as Record<string, unknown>);
  if (!list || typeof list !== "object") return [];

  const out: VideoCandidate[] = [];
  for (const [key, raw] of Object.entries(list)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const url = typeof item.url === "string" ? sanitizeMediaUrl(item.url) : "";
    if (!/^https?:\/\//i.test(url)) continue;
    const hls = /\.m3u8(\?|$)/i.test(url) || /HLS/i.test(key);
    if (hls && !allowHls) continue;
    const width = typeof item.width === "number" ? item.width : /1080|720|480|360/.test(key)
      ? Number(key.match(/(1080|720|480|360)/)?.[1] ?? 0)
      : 0;
    const height = typeof item.height === "number" ? item.height : 0;
    out.push({ url, width, height, hls });
  }
  return out;
}

function pickBestVideo(candidates: VideoCandidate[], allowHls: boolean): string | null {
  if (!candidates.length) return null;
  const byRes = (a: VideoCandidate, b: VideoCandidate) =>
    b.width * b.height - a.width * a.height || b.width - a.width;

  if (allowHls) {
    // HLS is usually the highest quality Pinterest serves
    const hls = candidates.filter((c) => c.hls).sort(byRes);
    if (hls[0]) return hls[0].url;
  }
  const mp4 = candidates.filter((c) => !c.hls).sort(byRes);
  return mp4[0]?.url ?? null;
}

function imageUrlFromImagesMap(images: unknown): string | null {
  if (!images || typeof images !== "object") return null;
  const map = images as Record<string, { url?: string } | string>;
  const order = ["orig", "originals", "1200x", "736x", "564x", "474x", "236x"];
  for (const key of order) {
    const slot = map[key];
    const u =
      typeof slot === "string"
        ? slot
        : slot && typeof slot === "object"
          ? slot.url
          : undefined;
    if (typeof u === "string" && /pinimg\.com/i.test(u)) {
      return key === "orig" || key === "originals" ? sanitizeMediaUrl(u) : toOriginalsUrl(u);
    }
  }
  // Any remaining size → upgrade to originals
  for (const slot of Object.values(map)) {
    const u =
      typeof slot === "string"
        ? slot
        : slot && typeof slot === "object"
          ? slot.url
          : undefined;
    if (typeof u === "string" && /pinimg\.com/i.test(u)) return toOriginalsUrl(u);
  }
  return null;
}

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

function extractFromPinObject(
  pin: Record<string, unknown>,
  allowHls: boolean
): { imageUrl: string | null; videoUrl: string | null; title?: string; fallbacks: string[]; carouselImages?: string[] } {
  const title = titleFromPin(pin);
  const fallbacks: string[] = [];

  // Story pin: prefer first media block (video or image)
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
            const vids = extractVideoList(b.video, allowHls);
            const videoUrl = pickBestVideo(vids, allowHls);
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

  // Carousel: all slots (originals when available)
  const carousel = pin.carousel_data;
  if (carousel && typeof carousel === "object") {
    const slots = (carousel as { carousel_slots?: unknown[] }).carousel_slots;
    if (Array.isArray(slots) && slots.length) {
      const carouselImages: string[] = [];
      for (const raw of slots) {
        if (!raw || typeof raw !== "object") continue;
        const slot = raw as { images?: unknown; videos?: unknown };
        if (slot.videos) {
          const vids = extractVideoList(slot.videos, allowHls);
          const videoUrl = pickBestVideo(vids, allowHls);
          if (videoUrl) {
            // Prefer first video edge as primary for mixed carousels
            if (!carouselImages.length) {
              return { imageUrl: null, videoUrl, title, fallbacks, carouselImages: [] };
            }
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

  // Native video
  if (pin.videos) {
    const vids = extractVideoList(pin.videos, allowHls);
    const videoUrl = pickBestVideo(vids, allowHls);
    if (videoUrl) {
      // Keep still as cover fallback only if video fails later
      const cover = imageUrlFromImagesMap(pin.images);
      if (cover) fallbacks.push(cover);
      return { imageUrl: null, videoUrl, title, fallbacks };
    }
  }

  const imageUrl = imageUrlFromImagesMap(pin.images);
  if (imageUrl) {
    // Prefer jpg/png/webp originals if path is signature-based
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

async function fetchPinResource(
  pinId: string,
  opts?: { appVersion?: string; htmlCookies?: string }
): Promise<Record<string, unknown> | null> {
  const sourceUrl = `/pin/${pinId}/`;
  const data = JSON.stringify({
    options: { id: pinId, field_set_key: "detailed" },
    context: {},
  });
  const url = new URL("https://www.pinterest.com/resource/PinResource/get/");
  url.searchParams.set("source_url", sourceUrl);
  url.searchParams.set("data", data);
  url.searchParams.set("_", String(Date.now()));

  const csrf = pinterestCsrfToken();
  const headers = pinterestRequestHeaders({
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "X-Pinterest-AppState": "active",
    "X-Pinterest-PWS-Handler": "www/pin/[id].js",
    "X-Pinterest-Source-Url": sourceUrl,
    Referer: `https://www.pinterest.com${sourceUrl}`,
  });
  if (opts?.appVersion) headers["X-APP-VERSION"] = opts.appVersion;
  if (csrf) {
    headers["X-CSRFToken"] = csrf;
    headers["X-Pinterest-CSRF"] = csrf;
  }
  if (!headers.Cookie) {
    const token = `pinforge${Math.random().toString(36).slice(2, 10)}`;
    headers.Cookie = opts?.htmlCookies
      ? `${opts.htmlCookies}; csrftoken=${token}`
      : `csrftoken=${token}`;
    headers["X-CSRFToken"] = token;
  }

  const res = await fetch(url.toString(), { headers, redirect: "follow" });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    resource_response?: { data?: Record<string, unknown> | null };
  };
  const pin = json.resource_response?.data;
  if (!pin || typeof pin !== "object") return null;
  // Ensure we got the requested pin (API sometimes returns empty/error envelopes)
  if (pin.id != null && String(pin.id) !== pinId) return null;
  return pin;
}

/** Find the pin object for this id inside __PWS_DATA__ (avoids related-pin pollution). */
function findPinInHtml(html: string, pinId: string): Record<string, unknown> | null {
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

function findPinNode(
  node: unknown,
  pinId: string,
  depth: number
): Record<string, unknown> | null {
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
  if (String(id) === pinId && (obj.images || obj.videos || obj.story_pin_data || obj.carousel_data)) {
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

function extractOgFallback(html: string): {
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
  const imageUrl = imageCandidates[0] ?? null;
  return { imageUrl, videoUrl, title };
}

async function downloadBinary(
  mediaUrl: string,
  accept: string
): Promise<{ buffer: Buffer; ext: string }> {
  const { buffer, contentType } = await downloadToBuffer(mediaUrl, {
    accept,
    referer: "https://www.pinterest.com/",
    concurrency: 4,
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      ...pinterestRequestHeaders(),
    },
  });
  const ext = extFromContentType(contentType, mediaUrl);
  return { buffer, ext };
}

async function downloadHlsAsMp4(m3u8Url: string): Promise<{ buffer: Buffer; ext: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pinforge-hls-"));
  const outPath = path.join(tmpDir, "video.mp4");
  const jobId = `hls_${Date.now().toString(36)}`;
  try {
    // Prefer segment checkpoint resume; fall back to ffmpeg playlist remux.
    try {
      const { downloadHlsResumable } = await import("../../extractors/hls");
      await downloadHlsResumable(m3u8Url, {
        jobId,
        jobDir: tmpDir,
        outPath,
        referer: "https://www.pinterest.com/",
        headers: {
          "User-Agent": USER_AGENT,
          ...pinterestRequestHeaders(),
        },
        provider: "pinterest",
      });
    } catch {
      await remuxHlsToMp4(m3u8Url, outPath, {
        referer: "https://www.pinterest.com/",
        userAgent: USER_AGENT,
      });
    }
    const buffer = await fs.readFile(outPath);
    return { buffer, ext: "mp4" };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Probe with GET Range (pinimg often rejects HEAD). */
async function urlExists(u: string): Promise<boolean> {
  try {
    const res = await fetch(u, {
      method: "GET",
      headers: {
        ...getPinterestFetchHeaders(),
        Referer: "https://www.pinterest.com/",
        Range: "bytes=0-0",
      },
      redirect: "follow",
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

async function resolveBestImageUrl(preferred: string, fallbacks: string[]): Promise<string> {
  const tried = new Set<string>();
  const candidates = [preferred, ...fallbacks].filter(Boolean);
  for (const raw of candidates) {
    const u = sanitizeMediaUrl(raw);
    if (!u || tried.has(u)) continue;
    tried.add(u);
    if (await urlExists(u)) return u;
  }
  return sanitizeMediaUrl(preferred);
}

function extractPinId(url: string): string | undefined {
  try {
    return new URL(url.trim()).pathname.match(/\/pin\/(\d+)/)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Resolve a pin URL to original image(s) or best video buffer.
 * Carousel pins return one PinAsset per slot.
 */
export async function resolvePin(url: string): Promise<PinAsset | PinAsset[]> {
  const pinUrl = normalizePinUrl(url);
  const pinId = extractPinId(pinUrl);
  if (!pinId) throw new Error("Not a Pinterest pin URL");

  const allowHls = Boolean(await resolveFfmpeg());

  let imageUrl: string | null = null;
  let videoUrl: string | null = null;
  let title: string | undefined;
  let fallbacks: string[] = [];
  let carouselImages: string[] = [];
  let html = "";
  let appVersion: string | undefined;

  // Fetch the pin page once — establishes cookies + often embeds the pin object
  try {
    const pageRes = await fetch(pinUrl, {
      headers: getPinterestFetchHeaders(),
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

  // PinResource API — detailed field set (orig + video_list)
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

  // Even when HTML had a pin node, prefer API media if it offers originals/video
  if (imageUrl && !/\/originals\//i.test(imageUrl)) {
    try {
      const pin = await fetchPinResource(pinId, { appVersion });
      if (pin) {
        const extracted = extractFromPinObject(pin, allowHls);
        if (extracted.videoUrl || (extracted.imageUrl && /\/originals\//i.test(extracted.imageUrl))) {
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

  // Playwright last resort
  if (!imageUrl && !videoUrl) {
    const { scrapePageMeta } = await import("../extractors/playwrightMeta");
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

  const slots =
    carouselImages.length > 1 ? carouselImages : [imageUrl];
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

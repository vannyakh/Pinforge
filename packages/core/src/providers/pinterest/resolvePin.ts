import type { PinAsset } from "../../types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const FETCH_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

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
  if (fromUrl && ["jpg", "jpeg", "png", "webp", "gif", "mp4", "webm"].includes(fromUrl)) {
    return fromUrl === "jpeg" ? "jpg" : fromUrl;
  }
  return "jpg";
}

/** Trim junk pasted after a pinimg URL (CSS, JSON delimiters, etc.). */
function sanitizeMediaUrl(raw: string): string {
  let u = raw.replace(/\\\//g, "/").replace(/\\u002F/g, "/").trim();
  const cut = u.search(/["'\s<>)}\\]|,(?=["'])/);
  if (cut > 0) u = u.slice(0, cut);
  // Prefer truncate after known media extension when CSS trails the URL
  const extMatch = u.match(
    /^(https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png|webp|gif|mp4|webm|m3u8))(?:[?#][^\s"'<>]*)?/i
  );
  if (extMatch) return extMatch[0];
  return u.replace(/[)}\];,]+$/g, "");
}

function pickBestImageUrl(candidates: string[]): string | null {
  const scored = candidates
    .map(sanitizeMediaUrl)
    .filter((u) => /^https?:\/\//i.test(u))
    .filter((u) => !u.includes("avatar") && !u.includes("75x75"))
    .filter((u) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) || /pinimg\.com\/(originals|\d+x)/i.test(u))
    .map((u) => {
      let score = 0;
      if (/originals|original/i.test(u)) score += 100;
      if (/1200x|736x|564x/i.test(u)) score += 50;
      if (/\.jpg|\.jpeg|\.png|\.webp/i.test(u)) score += 10;
      if (/pinimg\.com/i.test(u)) score += 20;
      return { u, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.u ?? null;
}

function pickBestVideoUrl(candidates: string[]): string | null {
  const scored = candidates
    .map(sanitizeMediaUrl)
    .filter((u) => /^https?:\/\//i.test(u))
    .filter((u) => /\.mp4|\.m3u8|video|vsec|pinimg\.com\/videos/i.test(u))
    .map((u) => {
      let score = 0;
      if (/\.mp4/i.test(u)) score += 50;
      if (/720|1080|hd/i.test(u)) score += 30;
      if (/pinimg\.com\/videos/i.test(u)) score += 40;
      return { u, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.u ?? null;
}

function extractFromHtml(html: string): {
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
  if (ogVideo?.[1]) videoCandidates.push(ogVideo[1]);

  const ogMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch?.[1]) imageCandidates.push(ogMatch[1]);

  const twMatch = html.match(
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
  );
  if (twMatch?.[1]) imageCandidates.push(twMatch[1]);

  const titleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) title = titleMatch[1].replace(/\s*[|\-–].*$/, "").trim();

  const jsonBlobs = [
    ...html.matchAll(/<script[^>]*id=["']__PWS_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];

  for (const m of jsonBlobs) {
    const raw = m[1];
    if (!raw) continue;
    const urls =
      raw.match(/https?:\\\/\\\/[^"\\]+pinimg\.com[^"\\]+/g) ??
      raw.match(/https?:\/\/[^"\\]+pinimg\.com[^"\\s]+/g) ??
      [];
    for (const u of urls) {
      const cleaned = sanitizeMediaUrl(u);
      if (/\/videos\/|\.mp4|\.m3u8/i.test(cleaned)) videoCandidates.push(cleaned);
      else imageCandidates.push(cleaned);
    }
  }

  const direct = html.match(/https?:\/\/i\.pinimg\.com\/[^"'\s<>)]+/g) ?? [];
  for (const u of direct) {
    const cleaned = sanitizeMediaUrl(u);
    if (/\/videos\/|\.mp4/i.test(cleaned)) videoCandidates.push(cleaned);
    else imageCandidates.push(cleaned);
  }

  const upgraded = imageCandidates.map((u) =>
    u.replace(/\/\d+x\d*\//, "/originals/").replace(/\/\d+x\//, "/originals/")
  );
  imageCandidates.push(...upgraded);

  return {
    videoUrl: pickBestVideoUrl(videoCandidates),
    imageUrl: pickBestImageUrl(imageCandidates),
    title,
  };
}

async function downloadBinary(
  mediaUrl: string,
  accept: string
): Promise<{ buffer: Buffer; ext: string }> {
  const res = await fetch(mediaUrl, {
    headers: {
      ...FETCH_HEADERS,
      Accept: accept,
      Referer: "https://www.pinterest.com/",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Failed to download media (${res.status}): ${mediaUrl}`);
  }

  const ab = await res.arrayBuffer();
  const buffer = Buffer.from(ab);
  const ext = extFromContentType(res.headers.get("content-type"), mediaUrl);
  return { buffer, ext };
}

/**
 * Resolve a public pin URL to image or video buffer.
 * Falls back to Playwright meta scrape when fetch HTML lacks media URLs.
 */
export async function resolvePin(url: string): Promise<PinAsset> {
  const pinUrl = normalizePinUrl(url);

  let html = "";
  try {
    const pageRes = await fetch(pinUrl, {
      headers: FETCH_HEADERS,
      redirect: "follow",
    });
    if (pageRes.ok) html = await pageRes.text();
  } catch {
    /* playwright below */
  }

  let { imageUrl, videoUrl, title } = html
    ? extractFromHtml(html)
    : { imageUrl: null, videoUrl: null, title: undefined };

  if (!imageUrl && !videoUrl) {
    const { scrapePageMeta } = await import("../extractors/playwrightMeta");
    const meta = await scrapePageMeta(pinUrl, {
      referer: "https://www.pinterest.com/",
      settleMs: 1000,
    });
    html = meta.html;
    const fromMeta = extractFromHtml(html);
    imageUrl = fromMeta.imageUrl || meta.ogImage || meta.images[0] || null;
    videoUrl = fromMeta.videoUrl || meta.ogVideo || meta.videos[0] || null;
    title = fromMeta.title || meta.ogTitle || meta.title || title;
  }

  if (videoUrl) {
    const { buffer, ext } = await downloadBinary(
      videoUrl,
      "video/mp4,video/*,*/*;q=0.8"
    );
    return {
      buffer,
      ext: ext === "jpg" ? "mp4" : ext,
      sourceUrl: videoUrl,
      title,
      kind: "video",
    };
  }

  if (!imageUrl) {
    throw new Error(
      "Could not find media on this pin page (fetch + Playwright). Make sure the pin is public."
    );
  }

  const { buffer, ext } = await downloadBinary(
    imageUrl,
    "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
  );

  return {
    buffer,
    ext,
    sourceUrl: imageUrl,
    title,
    kind: "image",
  };
}

import type { FormatPreset, ResolvedMedia } from "../../types";
import { fetchBinary, metaContent, toResolved } from "./http";
import { fetchHtmlOrPlaywrightMeta } from "./playwrightMeta";
import type { MediaInfo } from "../plugin";

function cleanUrl(raw: string): string {
  return raw.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&").trim();
}

function uniq(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const c = cleanUrl(u);
    if (!c.startsWith("http") || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** Collect carousel / sidecar media URLs from Instagram HTML blobs. */
export function extractInstagramCarouselUrls(html: string): {
  videos: string[];
  images: string[];
} {
  const videos: string[] = [];
  const images: string[] = [];

  const videoPatterns = [
    /"video_url"\s*:\s*"([^"]+)"/g,
    /https?:\\\/\\\/[^"\\]+cdninstagram\.com[^"\\]+\.mp4[^"\\]*/g,
    /https?:\/\/[^"'\s]+cdninstagram\.com[^"'\s]+\.mp4[^"'\s]*/g,
  ];
  for (const re of videoPatterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      videos.push((m[1] ?? m[0])!);
    }
  }

  const imagePatterns = [
    /"display_url"\s*:\s*"([^"]+)"/g,
    /"image_versions2"[^]]*?"url"\s*:\s*"([^"]+)"/g,
    /https?:\\\/\\\/[^"\\]+cdninstagram\.com[^"\\]+\.(?:jpg|jpeg|png|webp)[^"\\]*/gi,
    /https?:\/\/[^"'\s]+cdninstagram\.com[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi,
  ];
  for (const re of imagePatterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const u = (m[1] ?? m[0])!;
      if (/profile|s150x150|s320x320/i.test(u)) continue;
      images.push(u);
    }
  }

  return { videos: uniq(videos), images: uniq(images) };
}

export async function extractInstagramInfo(url: string): Promise<MediaInfo> {
  const pageUrl = url.trim().split("?")[0]!.replace(/\/$/, "") + "/";
  const { html, meta } = await fetchHtmlOrPlaywrightMeta(pageUrl, {
    referer: "https://www.instagram.com/",
    settleMs: 1200,
  });

  const fromHtml = extractInstagramCarouselUrls(html);
  const videos = [...fromHtml.videos];
  const images = [...fromHtml.images];

  const ogVideo =
    meta?.ogVideo ||
    metaContent(html, "og:video") ||
    metaContent(html, "og:video:secure_url");
  if (ogVideo) videos.unshift(cleanUrl(ogVideo));
  for (const v of meta?.videos ?? []) videos.push(cleanUrl(v));

  const ogImage = meta?.ogImage || meta?.images[0] || metaContent(html, "og:image");
  if (ogImage) images.unshift(cleanUrl(ogImage));

  const title =
    meta?.ogTitle || meta?.title || metaContent(html, "og:title") || "instagram";
  const channel =
    html.match(/"username"\s*:\s*"([^"]+)"/)?.[1] ||
    title.replace(/\s*[•·|].*$/, "").trim() ||
    undefined;

  const videoUrls = uniq(videos);
  if (videoUrls.length) {
    // Single reel/video — prefer video; for carousel mixed, keep first video + images
    const imageUrls = uniq(images).filter((u) => !videoUrls.includes(u));
    if (imageUrls.length > 1 && videoUrls.length === 1) {
      // Carousel with a video edge: return video first then photos
      return {
        kind: "video",
        urls: [videoUrls[0]!, ...imageUrls.slice(0, 11)],
        title,
        channel,
        thumbnail: imageUrls[0],
        metadata: { platform: "instagram", carousel: true },
      };
    }
    return {
      kind: "video",
      urls: [videoUrls[0]!],
      title,
      channel,
      thumbnail: uniq(images)[0],
      ext: "mp4",
      metadata: { platform: "instagram" },
    };
  }

  const imageUrls = uniq(images);
  if (imageUrls.length) {
    return {
      kind: "image",
      urls: imageUrls.slice(0, 20),
      title,
      channel,
      thumbnail: imageUrls[0],
      metadata: {
        platform: "instagram",
        carousel: imageUrls.length > 1,
      },
    };
  }

  throw new Error(
    "Could not extract Instagram media (fetch + Playwright). Post may be private or login-walled."
  );
}

/**
 * Public Instagram post / reel / carousel extractor.
 * Returns one ResolvedMedia or an array for albums.
 */
export async function extractInstagram(
  url: string,
  format: FormatPreset = "best",
  opts?: { fragmentConcurrency?: number; signal?: AbortSignal }
): Promise<ResolvedMedia | ResolvedMedia[]> {
  const info = await extractInstagramInfo(url);
  const results: ResolvedMedia[] = [];

  for (let i = 0; i < info.urls.length; i++) {
    const mediaUrl = info.urls[i]!;
    const isImage = /\.(jpe?g|png|webp)(\?|$)/i.test(mediaUrl) || info.kind === "image";
    // Mixed carousel: detect per URL
    const kind = isImage && !/\.mp4/i.test(mediaUrl) ? "image" : info.kind === "video" && /\.mp4/i.test(mediaUrl) ? "video" : isImage ? "image" : "video";
    const { buffer, ext } = await fetchBinary(mediaUrl, {
      referer: "https://www.instagram.com/",
      accept: kind === "image" ? "image/*,*/*;q=0.8" : "video/mp4,video/*,*/*;q=0.8",
      concurrency: opts?.fragmentConcurrency,
      signal: opts?.signal,
    });
    const title =
      info.urls.length > 1 ? `${info.title ?? "instagram"} (${i + 1})` : info.title;
    const resolved = toResolved(
      "instagram",
      url,
      buffer,
      kind === "image" ? ext || "jpg" : ext || "mp4",
      title,
      format === "audio-only" ? "best" : format
    );
    resolved.kind = kind;
    resolved.channel = info.channel;
    results.push(resolved);
  }

  return results.length === 1 ? results[0]! : results;
}

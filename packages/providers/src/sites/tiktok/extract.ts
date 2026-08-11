import type { FormatPreset, ResolvedMedia } from "@pinforge/types";
import { fetchBinary, metaContent, toResolved } from "@pinforge/download";
import { fetchHtmlOrPlaywrightMeta } from "../../extractors/playwrightMeta";
import type { MediaInfo } from "../../registry/plugin";
import { cleanUrl, uniqHttpUrls } from "@pinforge/common";

function pickPlayAddr(html: string): string | null {
  const playAddr =
    html.match(/"playAddr"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/"downloadAddr"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/"play_addr"[^}]*"url_list"\s*:\s*\[\s*"([^"]+)"/)?.[1];
  if (playAddr) return cleanUrl(playAddr);

  try {
    const univ = html.match(
      /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i
    )?.[1];
    if (univ) {
      const data = JSON.parse(univ) as Record<string, unknown>;
      const blob = JSON.stringify(data);
      const m =
        blob.match(/"playAddr":"([^"]+)"/) ||
        blob.match(/"downloadAddr":"([^"]+)"/) ||
        blob.match(/https:\\\/\\\/[^"]+tiktokcdn[^"]+\.mp4[^"]*/);
      if (m?.[1] || m?.[0]) return cleanUrl((m[1] ?? m[0])!);
    }
  } catch {
    /* ignore parse errors */
  }

  return metaContent(html, "og:video") || metaContent(html, "og:video:secure_url");
}

/** Photo-mode / slideshow image URLs from TikTok page data. */
export function extractTikTokImagePost(html: string): string[] {
  const images: string[] = [];
  const patterns = [
    /"imagePost"[^]*?"images"\s*:\s*\[([\s\S]*?)\]/,
    /"imageURL"[^]*?"urlList"\s*:\s*\[\s*"([^"]+)"/g,
    /"display_image"[^]*?"url_list"\s*:\s*\[\s*"([^"]+)"/g,
  ];

  const block = html.match(/"imagePost"\s*:\s*\{[\s\S]*?\}\s*,\s*"/);
  const searchIn = block?.[0] ?? html;
  const urlRe = /https:\\\/\\\/[^"\\]+(?:tiktokcdn|musical)[^"\\]+\.(?:jpe?g|png|webp)[^"\\]*/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(searchIn))) {
    images.push(m[0]);
  }

  for (const re of patterns.slice(1)) {
    re.lastIndex = 0;
    let hit: RegExpExecArray | null;
    while ((hit = re.exec(html))) {
      if (hit[1]) images.push(hit[1]);
    }
  }

  return uniqHttpUrls(images);
}

function pickCover(html: string, metaOg?: string | null): string | undefined {
  const cover =
    html.match(/"cover"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/"originCover"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/"dynamicCover"\s*:\s*"([^"]+)"/)?.[1] ||
    metaOg ||
    metaContent(html, "og:image");
  return cover ? cleanUrl(cover) : undefined;
}

export async function extractTikTokInfo(url: string): Promise<MediaInfo> {
  const { html, meta } = await fetchHtmlOrPlaywrightMeta(url.trim(), {
    referer: "https://www.tiktok.com/",
    settleMs: 1500,
  });

  const title =
    meta?.ogTitle ||
    meta?.title ||
    metaContent(html, "og:title") ||
    html.match(/"desc"\s*:\s*"([^"]{1,120})"/)?.[1] ||
    "tiktok";

  const author =
    html.match(/"uniqueId"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/"nickname"\s*:\s*"([^"]+)"/)?.[1] ||
    undefined;

  const music =
    html.match(/"music"[^]*?"title"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/"musicName"\s*:\s*"([^"]+)"/)?.[1] ||
    undefined;

  const cover = pickCover(html, meta?.ogImage);
  const photoUrls = extractTikTokImagePost(html);

  const videoUrl =
    pickPlayAddr(html) ||
    meta?.ogVideo ||
    meta?.videos.find((v) => /\.mp4/i.test(v)) ||
    meta?.videos[0] ||
    null;

  if (videoUrl) {
    return {
      kind: "video",
      urls: [cleanUrl(videoUrl)],
      title,
      channel: author,
      thumbnail: cover,
      ext: "mp4",
      metadata: {
        platform: "tiktok",
        music,
        author,
      },
    };
  }

  if (photoUrls.length) {
    return {
      kind: "image",
      urls: photoUrls.slice(0, 35),
      title,
      channel: author,
      thumbnail: cover || photoUrls[0],
      metadata: {
        platform: "tiktok",
        music,
        author,
        slideshow: true,
      },
    };
  }

  throw new Error(
    "Could not extract TikTok media (fetch + Playwright). Link may be private or region-blocked."
  );
}

/**
 * Public TikTok video / photo-post extractor — fetch first, Playwright fallback.
 */
export async function extractTikTok(
  url: string,
  format: FormatPreset = "best",
  opts?: { fragmentConcurrency?: number; signal?: AbortSignal }
): Promise<ResolvedMedia | ResolvedMedia[]> {
  const info = await extractTikTokInfo(url);
  const results: ResolvedMedia[] = [];

  for (let i = 0; i < info.urls.length; i++) {
    const mediaUrl = info.urls[i]!;
    const { buffer, ext } = await fetchBinary(mediaUrl, {
      referer: "https://www.tiktok.com/",
      accept: info.kind === "image" ? "image/*,*/*;q=0.8" : "video/mp4,video/*,*/*;q=0.8",
      concurrency: opts?.fragmentConcurrency,
      signal: opts?.signal,
    });
    const title = info.urls.length > 1 ? `${info.title ?? "tiktok"} (${i + 1})` : info.title;
    const resolved = toResolved(
      "tiktok",
      url,
      buffer,
      info.ext || ext,
      title,
      format === "audio-only" ? "best" : format
    );
    resolved.kind = info.kind;
    resolved.channel = info.channel;
    results.push(resolved);
  }

  return results.length === 1 ? results[0]! : results;
}

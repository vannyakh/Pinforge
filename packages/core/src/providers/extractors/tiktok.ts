import type { FormatPreset, ResolvedMedia } from "../../types";
import { fetchBinary, metaContent, toResolved } from "./http";
import { fetchHtmlOrPlaywrightMeta } from "./playwrightMeta";

function cleanUrl(raw: string): string {
  return raw.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&").trim();
}

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

/**
 * Public TikTok video extractor — fetch first, Playwright meta scrape fallback.
 */
export async function extractTikTok(
  url: string,
  format: FormatPreset = "best",
  opts?: { fragmentConcurrency?: number; signal?: AbortSignal }
): Promise<ResolvedMedia> {
  const { html, meta } = await fetchHtmlOrPlaywrightMeta(url.trim(), {
    referer: "https://www.tiktok.com/",
    settleMs: 1500,
  });

  const videoUrl =
    pickPlayAddr(html) ||
    meta?.ogVideo ||
    meta?.videos.find((v) => /\.mp4/i.test(v)) ||
    meta?.videos[0] ||
    null;

  if (!videoUrl) {
    throw new Error(
      "Could not extract TikTok video (fetch + Playwright). Link may be private or region-blocked."
    );
  }

  const { buffer, ext } = await fetchBinary(cleanUrl(videoUrl), {
    referer: "https://www.tiktok.com/",
    accept: "video/mp4,video/*,*/*;q=0.8",
    concurrency: opts?.fragmentConcurrency,
    signal: opts?.signal,
  });
  const title =
    meta?.ogTitle ||
    meta?.title ||
    metaContent(html, "og:title") ||
    html.match(/"desc"\s*:\s*"([^"]{1,120})"/)?.[1] ||
    "tiktok";
  return toResolved("tiktok", url, buffer, ext || "mp4", title, format);
}

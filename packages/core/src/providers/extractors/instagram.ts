import type { FormatPreset, ResolvedMedia } from "../../types";
import { fetchBinary, metaContent, toResolved } from "./http";
import { fetchHtmlOrPlaywrightMeta } from "./playwrightMeta";

function cleanUrl(raw: string): string {
  return raw.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&").trim();
}

/**
 * Public Instagram post / reel extractor.
 * Uses fetch meta first, then Playwright render for OG tags when blocked/SPA.
 */
export async function extractInstagram(
  url: string,
  format: FormatPreset = "best"
): Promise<ResolvedMedia> {
  const pageUrl = url.trim().split("?")[0]!.replace(/\/$/, "") + "/";
  const { html, meta } = await fetchHtmlOrPlaywrightMeta(pageUrl, {
    referer: "https://www.instagram.com/",
    settleMs: 1200,
  });

  const candidates: string[] = [];
  const ogVideo =
    meta?.ogVideo ||
    metaContent(html, "og:video") ||
    metaContent(html, "og:video:secure_url");
  if (ogVideo) candidates.push(cleanUrl(ogVideo));
  for (const v of meta?.videos ?? []) candidates.push(cleanUrl(v));

  const jsonUrls =
    html.match(/https?:\\\/\\\/[^"\\]+cdninstagram\.com[^"\\]+/g) ??
    html.match(/https?:\/\/[^"'\s]+cdninstagram\.com[^"'\s]+/g) ??
    [];
  for (const u of jsonUrls) {
    const cleaned = cleanUrl(u).replace(/[)\\]}\s].*$/, "");
    if (/\.mp4|video/i.test(cleaned)) candidates.push(cleaned);
  }

  const videoUrl = candidates.find((u) => /\.mp4/i.test(u)) ?? candidates[0];
  const title =
    meta?.ogTitle || meta?.title || metaContent(html, "og:title") || "instagram";

  if (!videoUrl) {
    const ogImage =
      meta?.ogImage ||
      meta?.images[0] ||
      metaContent(html, "og:image");
    if (ogImage && format !== "audio-only") {
      const { buffer, ext } = await fetchBinary(cleanUrl(ogImage), {
        referer: "https://www.instagram.com/",
        accept: "image/*,*/*;q=0.8",
      });
      return toResolved("instagram", url, buffer, ext, title, format);
    }
    throw new Error(
      "Could not extract Instagram media (fetch + Playwright). Post may be private or login-walled."
    );
  }

  const { buffer, ext } = await fetchBinary(videoUrl, {
    referer: "https://www.instagram.com/",
    accept: "video/mp4,video/*,*/*;q=0.8",
  });
  return toResolved("instagram", url, buffer, ext || "mp4", title, format);
}

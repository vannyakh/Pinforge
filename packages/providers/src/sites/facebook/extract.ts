import type { FormatPreset, ResolvedMedia } from "@pinforge/types";
import { fetchBinary, metaContent, toResolved } from "@pinforge/download";
import { fetchHtmlOrPlaywrightMeta } from "../../extractors/playwrightMeta";
import type { MediaInfo } from "../../registry/plugin";
import { cleanUrl, uniqHttpUrls } from "@pinforge/common";
import { resolveYtdlpMedia } from "../ytdlp/resolve";
import { requireYtdlpMessage, resolveYtdlp } from "@pinforge/tools";

/** Pull common Facebook video URL keys from page HTML / JSON blobs. */
export function extractFacebookMediaUrls(html: string): {
  videos: string[];
  images: string[];
} {
  const videos: string[] = [];
  const images: string[] = [];

  const patterns = [
    /"playable_url_quality_hd"\s*:\s*"([^"]+)"/g,
    /"playable_url"\s*:\s*"([^"]+)"/g,
    /"browser_native_hd_url"\s*:\s*"([^"]+)"/g,
    /"browser_native_sd_url"\s*:\s*"([^"]+)"/g,
    /"hd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/g,
    /"sd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/g,
    /https:\\\/\\\/[^"\\]+fbcdn\.net[^"\\]+\.mp4[^"\\]*/g,
    /https?:\/\/[^"'\s]+fbcdn\.net[^"'\s]+\.mp4[^"'\s]*/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const raw = m[1] ?? m[0];
      if (raw) videos.push(raw);
    }
  }

  const ogVideo = metaContent(html, "og:video") || metaContent(html, "og:video:secure_url");
  if (ogVideo) videos.push(ogVideo);

  const ogImage = metaContent(html, "og:image") || metaContent(html, "og:image:secure_url");
  if (ogImage) images.push(ogImage);

  const imgRe = /https?:\/\/[^"'\s]+(?:fbcdn\.net|scontent)[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(html))) {
    if (im[0] && !/emoji|static\.xx/i.test(im[0])) images.push(im[0]);
  }

  return { videos: uniqHttpUrls(videos), images: uniqHttpUrls(images) };
}

export function isFacebookUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./, "");
    return /^(?:web\.|m\.|mbasic\.|mobile\.)?(facebook\.com|fb\.watch|fb\.com)$/i.test(host);
  } catch {
    return false;
  }
}

/** Profile / user page (not a single watch/reel/photo post). */
export function isFacebookProfileUrl(url: string): boolean {
  if (!isFacebookUrl(url)) return false;
  try {
    const u = new URL(url.trim());
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (/\/profile\.php$/i.test(path) && u.searchParams.has("id")) return true;
    if (/^\/people\//i.test(path)) return true;
    if (
      /^\/(?:watch|reel|reels|videos?|photo(?:s)?|posts?|permalink\.php|share|stories|story|groups|events|marketplace|login|home)(?:\/|$)/i.test(
        path
      )
    ) {
      return false;
    }
    // /username or /numeric_id
    const parts = path.split("/").filter(Boolean);
    return parts.length === 1;
  } catch {
    return false;
  }
}

/**
 * Extract MediaInfo for a public Facebook / Watch / Reels URL.
 */
export async function extractFacebookInfo(
  url: string,
  opts?: { signal?: AbortSignal }
): Promise<MediaInfo> {
  const pageUrl = url.trim();
  const { html, meta } = await fetchHtmlOrPlaywrightMeta(pageUrl, {
    referer: "https://www.facebook.com/",
    settleMs: 1800,
  });
  void opts;

  const fromHtml = extractFacebookMediaUrls(html);
  const videos = [...fromHtml.videos];
  const images = [...fromHtml.images];

  if (meta?.ogVideo) videos.unshift(cleanUrl(meta.ogVideo));
  for (const v of meta?.videos ?? []) videos.push(cleanUrl(v));
  if (meta?.ogImage) images.unshift(cleanUrl(meta.ogImage));
  for (const img of meta?.images ?? []) images.push(cleanUrl(img));

  const title =
    meta?.ogTitle ||
    meta?.title ||
    metaContent(html, "og:title") ||
    metaContent(html, "twitter:title") ||
    "facebook";

  const description =
    metaContent(html, "og:description") || metaContent(html, "description") || undefined;

  const videoUrls = uniqHttpUrls(videos).filter((u) => /\.mp4|video/i.test(u) || /fbcdn/i.test(u));
  if (videoUrls.length) {
    return {
      kind: "video",
      urls: [videoUrls[0]!],
      title,
      description,
      thumbnail: uniqHttpUrls(images)[0],
      ext: "mp4",
      metadata: {
        platform: "facebook",
        candidateVideos: videoUrls.length,
      },
    };
  }

  const imageUrls = uniqHttpUrls(images);
  if (imageUrls.length) {
    return {
      kind: "image",
      urls: imageUrls.slice(0, 12),
      title,
      description,
      thumbnail: imageUrls[0],
      metadata: {
        platform: "facebook",
        album: imageUrls.length > 1,
      },
    };
  }

  throw new Error(
    "Could not extract Facebook media. Post may be private, login-walled, or region-blocked."
  );
}

/**
 * Public Facebook video / photo extractor (no login).
 * Profiles and hard posts fall back to yt-dlp (same tool as desktop System settings).
 */
export async function extractFacebook(
  url: string,
  format: FormatPreset = "best",
  opts?: { fragmentConcurrency?: number; signal?: AbortSignal }
): Promise<ResolvedMedia | ResolvedMedia[]> {
  const pageUrl = url.trim();
  const profile = isFacebookProfileUrl(pageUrl);

  if (!profile) {
    try {
      return await extractFacebookNative(pageUrl, format, opts);
    } catch (nativeErr) {
      const ytdlp = await resolveYtdlp();
      if (!ytdlp) throw nativeErr;
      try {
        return await resolveYtdlpMedia(pageUrl, {
          format,
          signal: opts?.signal,
          noPlaylist: true,
        });
      } catch (ytdlpErr) {
        const nativeMsg = nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
        const ytdlpMsg = ytdlpErr instanceof Error ? ytdlpErr.message : String(ytdlpErr);
        throw new Error(`${nativeMsg} yt-dlp fallback also failed: ${sanitizeYtdlpError(ytdlpMsg)}`);
      }
    }
  }

  const ytdlp = await resolveYtdlp();
  if (!ytdlp) {
    throw new Error(
      `Facebook profile downloads need yt-dlp. ${requireYtdlpMessage()}`
    );
  }
  try {
    return await resolveYtdlpMedia(pageUrl, {
      format,
      signal: opts?.signal,
      // Profile tabs can resolve to a list; keep first/playlist item behavior via yt-dlp.
      noPlaylist: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Facebook profile download failed: ${sanitizeYtdlpError(msg)}`
    );
  }
}

async function extractFacebookNative(
  url: string,
  format: FormatPreset,
  opts?: { fragmentConcurrency?: number; signal?: AbortSignal }
): Promise<ResolvedMedia | ResolvedMedia[]> {
  const info = await extractFacebookInfo(url, { signal: opts?.signal });
  const results: ResolvedMedia[] = [];

  for (let i = 0; i < info.urls.length; i++) {
    const mediaUrl = info.urls[i]!;
    const accept = info.kind === "image" ? "image/*,*/*;q=0.8" : "video/mp4,video/*,*/*;q=0.8";
    const { buffer, ext } = await fetchBinary(mediaUrl, {
      referer: "https://www.facebook.com/",
      accept,
      concurrency: opts?.fragmentConcurrency,
      signal: opts?.signal,
    });
    const title = info.urls.length > 1 ? `${info.title ?? "facebook"} (${i + 1})` : info.title;
    const resolved = toResolved(
      "facebook",
      url,
      buffer,
      info.ext || ext,
      title,
      format === "audio-only" ? "best" : format
    );
    resolved.kind = info.kind;
    results.push(resolved);
  }

  return results.length === 1 ? results[0]! : results;
}

function sanitizeYtdlpError(message: string): string {
  if (/bad local file header/i.test(message) || /zipimport|EOFError/i.test(message)) {
    return "yt-dlp binary is corrupted. Reinstall yt-dlp in Settings → System.";
  }
  if (/ffmpeg-location .+ does not exist/i.test(message)) {
    return "ffmpeg path is invalid. Install/enable ffmpeg in Settings → System.";
  }
  return message.replace(/\s+/g, " ").trim().slice(0, 400);
}

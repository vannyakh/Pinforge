/**
 * YouTube playlist listing via Innertube.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyYt = any;

let innertubeMod: AnyYt | null = null;

async function getInnertube() {
  if (!innertubeMod) {
    innertubeMod = await import("youtubei.js");
  }
  return innertubeMod as typeof import("youtubei.js");
}

export interface YoutubePlaylistVideo {
  id: string;
  url: string;
  title?: string;
  coverUrl?: string;
  durationText?: string;
  durationSec?: number;
}

export interface YoutubePlaylistResolveResult {
  playlistId: string;
  playlistTitle?: string;
  videos: YoutubePlaylistVideo[];
  truncated?: boolean;
}

const DEFAULT_MAX = 50;

/** Pure playlist URL (not a watch URL with optional &list=). */
export function isYouTubePlaylistUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!/^(www\.)?(youtube\.com|m\.youtube\.com|music\.youtube\.com)$/i.test(u.hostname)) {
      return false;
    }
    // Watch / shorts with a video id stay single even if list= is present.
    if (u.searchParams.has("v")) return false;
    if (/\/(shorts|embed|live)\b/i.test(u.pathname)) return false;
    if (/\/playlist\/?/i.test(u.pathname)) return true;
    if (u.searchParams.has("list")) return true;
    return false;
  } catch {
    return false;
  }
}

export function extractYouTubePlaylistId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const list = u.searchParams.get("list");
    if (list && list.trim()) return list.trim();
    const fromPath = u.pathname.match(/\/playlist\/([^/?#]+)/i);
    if (fromPath?.[1]) return fromPath[1];
    return null;
  } catch {
    return null;
  }
}

function videoUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function youtubeThumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function pickVideoId(node: AnyYt): string | null {
  if (!node || typeof node !== "object") return null;
  if (node.content_type && String(node.content_type).toUpperCase() === "PLAYLIST") {
    return null;
  }
  const id =
    node.content_id ||
    node.id ||
    node.video_id ||
    node.on_tap_endpoint?.payload?.videoId ||
    node.endpoint?.payload?.videoId ||
    node.navigation_endpoint?.payload?.videoId;
  return typeof id === "string" && id.length >= 6 ? id : null;
}

function pickVideoTitle(node: AnyYt): string | undefined {
  const raw =
    node?.title?.text ??
    node?.title ??
    node?.metadata?.title?.text ??
    node?.metadata?.title ??
    node?.metadata?.lockup_metadata_view?.title?.text;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw.toString === "function") {
    const s = String(raw).trim();
    if (s && s !== "[object Object]") return s;
  }
  return undefined;
}

function pickCoverUrl(node: AnyYt, videoId: string): string {
  const candidates: unknown[] = [
    node?.thumbnail?.url,
    node?.thumbnail?.thumbnails,
    node?.thumbnails,
    node?.rich_thumbnail?.url,
    node?.content_image?.image?.[0]?.url,
    node?.metadata?.image?.image?.[0]?.url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) return c;
    if (Array.isArray(c) && c.length) {
      const last = c[c.length - 1];
      const url = typeof last === "string" ? last : last?.url;
      if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
    }
  }
  return youtubeThumbUrl(videoId);
}

function parseDurationText(raw: string): { text: string; sec?: number } | null {
  const text = raw.trim();
  if (!text) return null;
  const parts = text.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return { text };
  let sec = 0;
  if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
  else if (parts.length === 1) sec = parts[0];
  else return { text };
  return { text, sec };
}

function pickDuration(node: AnyYt): { text?: string; sec?: number } {
  const candidates = [
    node?.duration?.text,
    node?.duration,
    node?.length_text,
    node?.thumbnail_overlays?.find?.((o: AnyYt) => o?.text)?.text,
    node?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.text,
    node?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text,
  ];
  for (const c of candidates) {
    const raw =
      typeof c === "string"
        ? c
        : c && typeof c.toString === "function"
          ? String(c)
          : "";
    if (!raw || raw === "[object Object]") continue;
    if (!/\d/.test(raw)) continue;
    if (!/^\d{1,2}:\d{2}/.test(raw.trim()) && !/^\d+\s*(s|sec|min)/i.test(raw)) {
      continue;
    }
    const parsed = parseDurationText(raw);
    if (parsed) return { text: parsed.text, sec: parsed.sec };
  }
  return {};
}

function playlistTitleOf(pl: AnyYt): string | undefined {
  const raw =
    pl?.info?.title?.text ??
    pl?.info?.title ??
    pl?.header?.title?.text ??
    pl?.header?.title ??
    pl?.title?.text ??
    pl?.title;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw.toString === "function") {
    const s = String(raw).trim();
    if (s && s !== "[object Object]") return s;
  }
  return undefined;
}

/**
 * List videos from a YouTube playlist / mix URL.
 * Caps at `maxVideos` (default 50) and sets `truncated` when more exist.
 */
export async function resolveYouTubePlaylist(
  url: string,
  opts: { maxVideos?: number; signal?: AbortSignal } = {}
): Promise<YoutubePlaylistResolveResult> {
  const maxVideos = Math.max(1, Math.min(500, opts.maxVideos ?? DEFAULT_MAX));
  opts.signal?.throwIfAborted?.();

  const playlistId = extractYouTubePlaylistId(url);
  if (!playlistId) {
    throw new Error(
      "Could not find a playlist id in this URL. Use a /playlist?list=… link."
    );
  }

  const { Innertube, ClientType, UniversalCache } = await getInnertube();
  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    client_type: ClientType.WEB,
  });

  opts.signal?.throwIfAborted?.();
  let page: AnyYt = await yt.getPlaylist(playlistId);
  const playlistTitle = playlistTitleOf(page);

  const seen = new Set<string>();
  const videos: YoutubePlaylistVideo[] = [];

  const consume = (nodes: AnyYt[]) => {
    for (const node of nodes) {
      const id = pickVideoId(node);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const duration = pickDuration(node);
      videos.push({
        id,
        url: videoUrl(id),
        title: pickVideoTitle(node),
        coverUrl: pickCoverUrl(node, id),
        durationText: duration.text,
        durationSec: duration.sec,
      });
      if (videos.length >= maxVideos) return;
    }
  };

  consume([...(page.items ?? page.videos ?? [])]);

  let pages = 0;
  while (page.has_continuation && videos.length < maxVideos && pages < 30) {
    opts.signal?.throwIfAborted?.();
    page = await page.getContinuation();
    consume([...(page.items ?? page.videos ?? [])]);
    pages += 1;
  }

  return {
    playlistId,
    playlistTitle,
    videos,
    truncated: Boolean(page.has_continuation) || videos.length >= maxVideos,
  };
}

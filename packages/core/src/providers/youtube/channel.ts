/**
 * YouTube channel / profile listing via Innertube (+ HTML fallback for @handles).
 * Supports channel tabs: /videos, /shorts, /streams.
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

export interface YoutubeChannelVideo {
  id: string;
  url: string;
  title?: string;
  /** Cover / thumbnail URL when scraped or derived from video id. */
  coverUrl?: string;
  /** Display duration from listing (e.g. "12:34"). */
  durationText?: string;
  /** Duration in seconds when parseable. */
  durationSec?: number;
}

export type YoutubeChannelTab = "videos" | "shorts" | "streams";

export interface YoutubeChannelResolveResult {
  channelId: string;
  channelTitle?: string;
  videos: YoutubeChannelVideo[];
  truncated?: boolean;
  /** Which channel tab was listed. */
  tab: YoutubeChannelTab;
}

const DEFAULT_MAX = 50;

/** Strip /videos|/shorts|/streams tab so resolveURL / HTML work on the channel root. */
export function youtubeChannelRootUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const m = u.pathname.match(/^\/((?:channel|c|user)\/[^/]+|@[^/]+)/i);
    if (m) {
      u.pathname = `/${m[1]}`;
      u.search = "";
      u.hash = "";
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return url.trim();
}

/** Detect /videos, /shorts, or /streams tab from a channel URL. */
export function detectYouTubeChannelTab(url: string): YoutubeChannelTab {
  try {
    const u = new URL(url.trim());
    const tab = u.pathname.match(/\/(shorts|videos|streams)\/?$/i)?.[1]?.toLowerCase();
    if (tab === "shorts") return "shorts";
    if (tab === "streams") return "streams";
    return "videos";
  } catch {
    return "videos";
  }
}

/**
 * Channel / @handle / /c/ /user/ including tab paths (/shorts, /videos, /streams).
 * Not a single watch URL or /shorts/VIDEO_ID.
 */
export function isYouTubeChannelUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!/^(www\.)?(youtube\.com|m\.youtube\.com)$/i.test(u.hostname)) return false;
    if (u.searchParams.has("v")) return false;
    // Single Short: /shorts/abcdef…
    if (/\/shorts\/[\w-]+/i.test(u.pathname)) return false;
    if (/\/(watch|embed|live|playlist)\b/i.test(u.pathname)) return false;
    if (/^\/(channel|c|user)\/[^/]+/i.test(u.pathname)) return true;
    if (/^\/@[^/]+/i.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function videoUrl(id: string, tab: YoutubeChannelTab): string {
  if (tab === "shorts") return `https://www.youtube.com/shorts/${id}`;
  return `https://www.youtube.com/watch?v=${id}`;
}

function youtubeThumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function pickVideoId(node: AnyYt): string | null {
  if (!node || typeof node !== "object") return null;
  const id =
    node.content_id ||
    node.id ||
    node.video_id ||
    node.on_tap_endpoint?.payload?.videoId ||
    node.endpoint?.payload?.videoId ||
    node.navigation_endpoint?.payload?.videoId ||
    (typeof node.entity_id === "string" ? node.entity_id.replace(/^shorts-shelf-item-/, "") : null);
  if (typeof id === "string" && /^[\w-]{6,}$/.test(id)) return id;
  return null;
}

function pickVideoTitle(node: AnyYt): string | undefined {
  const raw =
    node?.title?.text ??
    node?.title ??
    node?.overlay_metadata?.primary_text?.text ??
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
    node?.overlays?.find?.((o: AnyYt) => typeof o?.text === "string")?.text,
    node?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.text,
    node?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text,
  ];
  for (const c of candidates) {
    const raw = typeof c === "string" ? c : c && typeof c.toString === "function" ? String(c) : "";
    if (!raw || raw === "[object Object]") continue;
    if (!/\d/.test(raw) || !/[:\d]/.test(raw)) continue;
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw.trim()) && !/^\d+\s*(s|sec|min)/i.test(raw)) {
      if (!/^\d{1,2}:\d{2}/.test(raw.trim())) continue;
    }
    const parsed = parseDurationText(raw);
    if (parsed) return { text: parsed.text, sec: parsed.sec };
  }
  return {};
}

async function resolveChannelIdFromHtml(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(youtubeChannelRootUrl(url), {
      signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const patterns = [
      /"externalId":"(UC[\w-]+)"/,
      /"browseId":"(UC[\w-]+)"/,
      /"canonicalBaseUrl":"\/channel\/(UC[\w-]+)"/,
      /channel_id=(UC[\w-]+)/,
      /"channelId":"(UC[\w-]+)"/,
      /\/channel\/(UC[\w-]+)/,
      /browse_id":"(UC[\w-]+)"/,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return m[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function resolveChannelId(url: string, yt: AnyYt, signal?: AbortSignal): Promise<string> {
  const root = youtubeChannelRootUrl(url);
  const u = new URL(root);
  const fromPath = u.pathname.match(/\/channel\/(UC[\w-]+)/i);
  if (fromPath?.[1]) return fromPath[1];

  try {
    const endpoint = await yt.resolveURL(root);
    const browseId =
      endpoint?.payload?.browseId ?? endpoint?.metadata?.browseId ?? endpoint?.browseId;
    if (typeof browseId === "string" && /^UC[\w-]+$/.test(browseId)) {
      return browseId;
    }
  } catch {
    /* fall through */
  }

  const fromHtml = await resolveChannelIdFromHtml(root, signal);
  if (fromHtml) return fromHtml;

  const handle = u.pathname.match(/^\/@([^/]+)/)?.[1];
  if (handle) {
    try {
      const results = await yt.search(`@${handle}`, { type: "channel" });
      const nodes = (results?.results ?? results?.channels ?? []) as AnyYt[];
      for (const node of nodes) {
        const id =
          node?.id ||
          node?.author?.id ||
          node?.endpoint?.payload?.browseId ||
          node?.navigation_endpoint?.payload?.browseId;
        if (typeof id === "string" && /^UC[\w-]+$/.test(id)) return id;
      }
    } catch {
      /* ignore */
    }
  }

  throw new Error(
    "Could not resolve YouTube channel id from this URL. Use a /channel/UC… link or a public @handle."
  );
}

async function loadChannelTabPage(channel: AnyYt, tab: YoutubeChannelTab): Promise<AnyYt | null> {
  if (tab === "shorts") {
    if (!channel.has_shorts) return null;
    return channel.getShorts();
  }
  if (tab === "streams") {
    if (!channel.has_live_streams) return null;
    return channel.getLiveStreams();
  }
  if (!channel.has_videos) return null;
  return channel.getVideos();
}

/**
 * List uploads from a YouTube channel / profile URL (optionally a /shorts or /streams tab).
 * Caps at `maxVideos` (default 50) and sets `truncated` when more exist.
 */
export async function resolveYouTubeChannel(
  url: string,
  opts: { maxVideos?: number; signal?: AbortSignal } = {}
): Promise<YoutubeChannelResolveResult> {
  const maxVideos = Math.max(1, Math.min(500, opts.maxVideos ?? DEFAULT_MAX));
  const tab = detectYouTubeChannelTab(url);
  opts.signal?.throwIfAborted?.();

  const { Innertube, ClientType, UniversalCache } = await getInnertube();
  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    client_type: ClientType.WEB,
  });

  const channelId = await resolveChannelId(url, yt, opts.signal);
  opts.signal?.throwIfAborted?.();

  const channel = await yt.getChannel(channelId);
  const header = channel.header as AnyYt;
  const channelTitleRaw =
    channel.metadata?.title ||
    header?.author?.name ||
    header?.title?.toString?.() ||
    header?.title ||
    undefined;
  const channelTitle =
    typeof channelTitleRaw === "string" && channelTitleRaw.trim()
      ? channelTitleRaw.trim()
      : undefined;

  const firstPage = await loadChannelTabPage(channel, tab);
  if (!firstPage) {
    return { channelId, channelTitle, videos: [], tab, truncated: false };
  }

  let page: AnyYt = firstPage;
  const seen = new Set<string>();
  const videos: YoutubeChannelVideo[] = [];

  const consume = (nodes: AnyYt[]) => {
    for (const node of nodes) {
      const id = pickVideoId(node);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const duration = pickDuration(node);
      videos.push({
        id,
        url: videoUrl(id, tab),
        title: pickVideoTitle(node),
        coverUrl: pickCoverUrl(node, id),
        durationText: duration.text,
        durationSec: duration.sec,
      });
      if (videos.length >= maxVideos) return;
    }
  };

  consume([...(page.videos ?? [])]);

  let pages = 0;
  while (page.has_continuation && videos.length < maxVideos && pages < 20) {
    opts.signal?.throwIfAborted?.();
    page = await page.getContinuation();
    consume([...(page.videos ?? [])]);
    pages += 1;
  }

  return {
    channelId,
    channelTitle,
    videos,
    truncated: Boolean(page.has_continuation) || videos.length >= maxVideos,
    tab,
  };
}

/**
 * YouTube channel / profile listing via Innertube (+ HTML fallback for @handles).
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
}

export interface YoutubeChannelResolveResult {
  channelId: string;
  channelTitle?: string;
  videos: YoutubeChannelVideo[];
  truncated?: boolean;
}

const DEFAULT_MAX = 50;

/** Channel / @handle / /c/ /user/ — not a single watch/shorts URL. */
export function isYouTubeChannelUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!/^(www\.)?(youtube\.com|m\.youtube\.com)$/i.test(u.hostname)) return false;
    if (u.searchParams.has("v")) return false;
    if (/\/(watch|shorts|embed|live|playlist)\b/i.test(u.pathname)) return false;
    if (/^\/(channel|c|user)\//i.test(u.pathname)) return true;
    if (/^\/@/.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
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

async function resolveChannelIdFromHtml(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, {
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
    // Prefer canonical / owner ids — bare "channelId" often matches related channels first.
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
  const u = new URL(url.trim());
  const fromPath = u.pathname.match(/\/channel\/(UC[\w-]+)/i);
  if (fromPath?.[1]) return fromPath[1];

  try {
    const endpoint = await yt.resolveURL(url.trim());
    const browseId =
      endpoint?.payload?.browseId ??
      endpoint?.metadata?.browseId ??
      endpoint?.browseId;
    if (typeof browseId === "string" && /^UC[\w-]+$/.test(browseId)) {
      return browseId;
    }
  } catch {
    /* fall through */
  }

  const fromHtml = await resolveChannelIdFromHtml(url, signal);
  if (fromHtml) return fromHtml;

  // Last resort: search by @handle / path segment
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

/**
 * List uploads from a YouTube channel / profile URL.
 * Caps at `maxVideos` (default 50) and sets `truncated` when more exist.
 */
export async function resolveYouTubeChannel(
  url: string,
  opts: { maxVideos?: number; signal?: AbortSignal } = {}
): Promise<YoutubeChannelResolveResult> {
  const maxVideos = Math.max(1, Math.min(500, opts.maxVideos ?? DEFAULT_MAX));
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

  if (!channel.has_videos) {
    return { channelId, channelTitle, videos: [] };
  }

  let page: AnyYt = await channel.getVideos();
  const seen = new Set<string>();
  const videos: YoutubeChannelVideo[] = [];

  const consume = (nodes: AnyYt[]) => {
    for (const node of nodes) {
      const id = pickVideoId(node);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      videos.push({
        id,
        url: videoUrl(id),
        title: pickVideoTitle(node),
        coverUrl: pickCoverUrl(node, id),
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
  };
}

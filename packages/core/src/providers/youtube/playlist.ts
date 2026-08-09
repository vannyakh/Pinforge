/**
 * YouTube playlist listing via Innertube.
 * Regular playlists use browse (`getPlaylist`); Mix / radio (`RD…`) use the
 * watch-next playlist panel because `/playlist?list=RD…` is unviewable.
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

/** Mix / radio / other lists that fail on /playlist?list=… (“unviewable”). */
export function isYouTubeMixPlaylistId(playlistId: string): boolean {
  const id = playlistId.trim();
  if (!id) return false;
  // RD* = Mix / radio; MLCT / RLTD* = known unviewable prefixes (yt-dlp).
  if (/^RD/i.test(id)) return true;
  if (/^MLCT$/i.test(id)) return true;
  if (/^RLTD[\w-]{22}$/i.test(id)) return true;
  return false;
}

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

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{6,}$/.test(v)) return v;
    const shorts = u.pathname.match(/\/shorts\/([\w-]+)/i)?.[1];
    if (shorts) return shorts;
    const embed = u.pathname.match(/\/embed\/([\w-]+)/i)?.[1];
    if (embed) return embed;
    if (/^(youtu\.be)$/i.test(u.hostname.replace(/^www\./, ""))) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^[\w-]{6,}$/.test(id)) return id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Best-effort seed video for Mix ids (e.g. RD + 11-char video id).
 * Returns null when the seed cannot be inferred from the playlist id alone.
 */
export function seedVideoIdFromMixPlaylistId(playlistId: string): string | null {
  const id = playlistId.trim();
  // Classic Mix: RD + videoId
  const rdVideo = id.match(/^RD([\w-]{11})$/i);
  if (rdVideo) return rdVideo[1];
  // YouTube Music automix: RDAMVM + videoId
  const rdAmvm = id.match(/^RDAMVM([\w-]{11})$/i);
  if (rdAmvm) return rdAmvm[1];
  // Topic / longer RD* ids — last 11 chars are often the seed
  if (/^RD/i.test(id) && id.length > 13) {
    const tail = id.slice(-11);
    if (/^[\w-]{11}$/.test(tail)) return tail;
  }
  return null;
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
  const primary = node.primary && typeof node.primary === "object" ? node.primary : null;
  const id =
    node.video_id ||
    primary?.video_id ||
    node.content_id ||
    node.id ||
    node.on_tap_endpoint?.payload?.videoId ||
    node.endpoint?.payload?.videoId ||
    node.navigation_endpoint?.payload?.videoId ||
    primary?.endpoint?.payload?.videoId;
  return typeof id === "string" && id.length >= 6 ? id : null;
}

function pickVideoTitle(node: AnyYt): string | undefined {
  const primary = node?.primary && typeof node.primary === "object" ? node.primary : null;
  const raw =
    node?.title?.text ??
    node?.title ??
    primary?.title?.text ??
    primary?.title ??
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
  const primary = node?.primary && typeof node.primary === "object" ? node.primary : null;
  const candidates: unknown[] = [
    node?.thumbnail?.url,
    node?.thumbnail?.thumbnails,
    node?.thumbnails,
    primary?.thumbnail?.url,
    primary?.thumbnail?.thumbnails,
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
  const primary = node?.primary && typeof node.primary === "object" ? node.primary : null;
  const candidates = [
    node?.duration?.text,
    node?.duration,
    primary?.duration?.text,
    primary?.duration,
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

function isUnviewablePlaylistError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /unviewable|playlist type/i.test(msg);
}

function toPlaylistVideo(node: AnyYt): YoutubePlaylistVideo | null {
  const id = pickVideoId(node);
  if (!id) return null;
  const duration = pickDuration(node);
  return {
    id,
    url: videoUrl(id),
    title: pickVideoTitle(node),
    coverUrl: pickCoverUrl(node, id),
    durationText: duration.text,
    durationSec: duration.sec,
  };
}

/**
 * Mix / radio lists only work from watch?v=…&list=RD… (inline playlist panel).
 */
async function resolveYouTubeMixPlaylist(
  playlistId: string,
  opts: { maxVideos: number; seedVideoId?: string | null; signal?: AbortSignal }
): Promise<YoutubePlaylistResolveResult> {
  const seed =
    opts.seedVideoId ||
    seedVideoIdFromMixPlaylistId(playlistId);
  if (!seed) {
    throw new Error(
      "This Mix / radio playlist needs a video id. Open a watch URL with &list=… (not /playlist?list=… alone)."
    );
  }

  opts.signal?.throwIfAborted?.();
  const { Innertube, ClientType, UniversalCache, YTNodes } = await getInnertube();
  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    client_type: ClientType.WEB,
  });

  const NavigationEndpoint = YTNodes.NavigationEndpoint;
  const seen = new Set<string>();
  const videos: YoutubePlaylistVideo[] = [];
  let playlistTitle: string | undefined;
  let cursor = seed;
  let pages = 0;
  let isInfinite = true;

  while (videos.length < opts.maxVideos && pages < 40) {
    opts.signal?.throwIfAborted?.();
    const endpoint = new NavigationEndpoint({
      watchEndpoint: { videoId: cursor, playlistId },
    });
    const info = await yt.getInfo(endpoint);
    const panel = info.playlist;
    if (!panel?.contents?.length) {
      if (videos.length === 0) {
        // Fallback: Music “Up Next” automix from the seed video
        try {
          const panelMusic = await yt.music.getUpNext(seed, true);
          playlistTitle = playlistTitleOf(panelMusic) ?? playlistTitle;
          for (const node of panelMusic.contents ?? []) {
            const item = toPlaylistVideo(node);
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            videos.push(item);
            if (videos.length >= opts.maxVideos) break;
          }
        } catch {
          /* ignore — throw below if still empty */
        }
      }
      break;
    }

    if (!playlistTitle) {
      playlistTitle =
        typeof panel.title === "string"
          ? panel.title
          : playlistTitleOf({ title: panel.title });
    }
    isInfinite = Boolean(panel.is_infinite);

    let added = 0;
    for (const node of panel.contents) {
      const item = toPlaylistVideo(node);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      videos.push(item);
      added += 1;
      if (videos.length >= opts.maxVideos) break;
    }

    pages += 1;
    const lastId = pickVideoId(panel.contents[panel.contents.length - 1]);
    if (!lastId || lastId === cursor || added === 0) break;
    if (!isInfinite && videos.length >= (panel.contents?.length ?? 0)) break;
    cursor = lastId;
  }

  if (videos.length === 0) {
    throw new Error(
      "Could not load videos from this Mix / radio playlist. Try the full watch URL with &list=…"
    );
  }

  return {
    playlistId,
    playlistTitle: playlistTitle || `Mix`,
    videos,
    truncated: isInfinite || videos.length >= opts.maxVideos,
  };
}

async function resolveYouTubeBrowsePlaylist(
  playlistId: string,
  opts: { maxVideos: number; signal?: AbortSignal }
): Promise<YoutubePlaylistResolveResult> {
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
      const item = toPlaylistVideo(node);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      videos.push(item);
      if (videos.length >= opts.maxVideos) return;
    }
  };

  consume([...(page.items ?? page.videos ?? [])]);

  let pages = 0;
  while (page.has_continuation && videos.length < opts.maxVideos && pages < 30) {
    opts.signal?.throwIfAborted?.();
    page = await page.getContinuation();
    consume([...(page.items ?? page.videos ?? [])]);
    pages += 1;
  }

  return {
    playlistId,
    playlistTitle,
    videos,
    truncated: Boolean(page.has_continuation) || videos.length >= opts.maxVideos,
  };
}

/**
 * List videos from a YouTube playlist / mix URL.
 * Caps at `maxVideos` (default 50) and sets `truncated` when more exist.
 *
 * Mix / radio (`RD…`) require a seed video (`v=` in the URL, or inferred from the list id).
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
      "Could not find a playlist id in this URL. Use a /playlist?list=… or watch?v=…&list=… link."
    );
  }

  const seedVideoId = extractYouTubeVideoId(url);

  if (isYouTubeMixPlaylistId(playlistId)) {
    return resolveYouTubeMixPlaylist(playlistId, {
      maxVideos,
      seedVideoId,
      signal: opts.signal,
    });
  }

  try {
    return await resolveYouTubeBrowsePlaylist(playlistId, {
      maxVideos,
      signal: opts.signal,
    });
  } catch (err) {
    if (isUnviewablePlaylistError(err) || seedVideoId) {
      return resolveYouTubeMixPlaylist(playlistId, {
        maxVideos,
        seedVideoId,
        signal: opts.signal,
      });
    }
    throw err;
  }
}

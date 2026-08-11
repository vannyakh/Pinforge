// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyYt = any;

export interface YoutubePlaylistVideo {
  id: string;
  url: string;
  title?: string;
  coverUrl?: string;
  durationText?: string;
  durationSec?: number;
}

function videoUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function youtubeThumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function pickVideoId(node: AnyYt): string | null {
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
    const raw = typeof c === "string" ? c : c && typeof c.toString === "function" ? String(c) : "";
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

export function playlistTitleOf(pl: AnyYt): string | undefined {
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

export function toPlaylistVideo(node: AnyYt): YoutubePlaylistVideo | null {
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

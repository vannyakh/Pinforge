import { cleanUrl } from "@pinforge/common";

export interface TikTokProfileVideo {
  id: string;
  url: string;
  title?: string;
  coverUrl?: string;
  durationText?: string;
  durationSec?: number;
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function durationFromItem(item: Record<string, unknown>): {
  durationSec?: number;
  durationText?: string;
} {
  const video = item.video as Record<string, unknown> | undefined;
  let raw =
    (typeof video?.duration === "number" ? video.duration : undefined) ??
    (typeof item.duration === "number" ? item.duration : undefined);
  if (typeof raw !== "number" || !(raw > 0)) return {};
  // TikTok sometimes stores ms
  if (raw > 3600) raw = Math.round(raw / 1000);
  return { durationSec: raw, durationText: formatDuration(raw) };
}

function coverFromItem(item: Record<string, unknown>): string | undefined {
  const video = item.video as Record<string, unknown> | undefined;
  for (const key of ["cover", "originCover", "dynamicCover"]) {
    const v = video?.[key];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return cleanUrl(v);
  }
  const covers = video?.zoomCover as Record<string, string> | undefined;
  if (covers && typeof covers === "object") {
    for (const v of Object.values(covers)) {
      if (typeof v === "string" && /^https?:\/\//i.test(v)) return cleanUrl(v);
    }
  }
  return undefined;
}

export function videoFromItem(
  item: Record<string, unknown>,
  username: string
): TikTokProfileVideo | null {
  const idRaw = item.id ?? item.aweme_id ?? item.video_id;
  const id = typeof idRaw === "string" || typeof idRaw === "number" ? String(idRaw) : "";
  if (!/^\d{5,}$/.test(id)) return null;
  const titleRaw = item.desc ?? item.title ?? item.contentDesc;
  const title =
    typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim().slice(0, 200) : undefined;
  const dur = durationFromItem(item);
  return {
    id,
    url: `https://www.tiktok.com/@${username}/video/${id}`,
    title,
    coverUrl: coverFromItem(item),
    ...dur,
  };
}

export function parseJsonScript(html: string, id: string): unknown | null {
  const re = new RegExp(`<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i");
  const m = html.match(re);
  if (!m?.[1]?.trim()) return null;
  try {
    return JSON.parse(m[1].trim()) as unknown;
  } catch {
    return null;
  }
}

export function walkCollectItems(
  node: unknown,
  username: string,
  map: Map<string, TikTokProfileVideo>,
  depth = 0
) {
  if (depth > 14 || node == null || map.size > 500) return;
  if (Array.isArray(node)) {
    for (const item of node) walkCollectItems(item, username, map, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const maybe = videoFromItem(obj, username);
  if (maybe && (obj.video || obj.desc != null || obj.stats || obj.createTime)) {
    if (!map.has(maybe.id)) map.set(maybe.id, maybe);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") walkCollectItems(v, username, map, depth + 1);
  }
}

export function extractUserMeta(data: unknown): {
  secUid?: string;
  displayName?: string;
  userId?: string;
} {
  const scope =
    data && typeof data === "object"
      ? ((data as Record<string, unknown>).__DEFAULT_SCOPE__ as Record<string, unknown> | undefined)
      : undefined;
  const detail = scope?.["webapp.user-detail"] as Record<string, unknown> | undefined;
  const userInfo = detail?.userInfo as Record<string, unknown> | undefined;
  const user = userInfo?.user as Record<string, unknown> | undefined;
  const secUid = typeof user?.secUid === "string" ? user.secUid : undefined;
  const displayName =
    typeof user?.nickname === "string" && user.nickname.trim() ? user.nickname.trim() : undefined;
  const userId =
    user?.id != null ? String(user.id) : user?.uid != null ? String(user.uid) : undefined;
  if (!secUid) {
    const blob = JSON.stringify(data ?? {});
    const m = blob.match(/"secUid"\s*:\s*"([^"]+)"/);
    if (m?.[1]) return { secUid: m[1], displayName, userId };
  }
  return { secUid, displayName, userId };
}

export function upsertVideo(map: Map<string, TikTokProfileVideo>, video: TikTokProfileVideo) {
  const prev = map.get(video.id);
  if (!prev) {
    map.set(video.id, video);
    return;
  }
  map.set(video.id, {
    ...prev,
    title: video.title ?? prev.title,
    coverUrl: video.coverUrl ?? prev.coverUrl,
    durationSec: video.durationSec ?? prev.durationSec,
    durationText: video.durationText ?? prev.durationText,
  });
}

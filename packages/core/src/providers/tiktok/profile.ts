/**
 * TikTok profile (@handle) listing via page rehydration JSON + item_list API.
 */

import { EXTRACTOR_HEADERS } from "../extractors/http";
import { fetchTikTokProfileViaBrowser } from "./fetchHtml";

export interface TikTokProfileVideo {
  id: string;
  url: string;
  title?: string;
  coverUrl?: string;
  durationText?: string;
  durationSec?: number;
}

export interface TikTokProfileResolveResult {
  username: string;
  displayName?: string;
  videos: TikTokProfileVideo[];
  truncated?: boolean;
}

const DEFAULT_MAX = 50;
const PAGE_SIZE = 35;

export function isTikTokProfileUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!/^(www\.)?(tiktok\.com)$/i.test(u.hostname)) return false;
    const path = u.pathname.replace(/\/+$/, "") || "/";
    // Single video: /@user/video/123
    if (/\/@[^/]+\/video\//i.test(path)) return false;
    // Profile: /@user or /@user/…
    if (/^\/@[^/]+$/i.test(path)) return true;
    if (/^\/@[^/]+\/(video)?$/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

export function normalizeTikTokProfileUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const m = u.pathname.match(/^\/(@[^/]+)/i);
    if (m?.[1]) {
      u.pathname = `/${m[1]}`;
      u.search = "";
      u.hash = "";
      return u.toString().replace(/\/+$/, "");
    }
  } catch {
    /* ignore */
  }
  return url.trim().replace(/\/+$/, "");
}

export function extractTikTokUsername(url: string): string | undefined {
  try {
    const m = new URL(url.trim()).pathname.match(/^\/@([^/]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

function cleanUrl(raw: string): string {
  return raw
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
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

function videoFromItem(
  item: Record<string, unknown>,
  username: string
): TikTokProfileVideo | null {
  const idRaw = item.id ?? item.aweme_id ?? item.video_id;
  const id =
    typeof idRaw === "string" || typeof idRaw === "number" ? String(idRaw) : "";
  if (!/^\d{5,}$/.test(id)) return null;
  const titleRaw = item.desc ?? item.title ?? item.contentDesc;
  const title =
    typeof titleRaw === "string" && titleRaw.trim()
      ? titleRaw.trim().slice(0, 200)
      : undefined;
  const dur = durationFromItem(item);
  return {
    id,
    url: `https://www.tiktok.com/@${username}/video/${id}`,
    title,
    coverUrl: coverFromItem(item),
    ...dur,
  };
}

function parseJsonScript(html: string, id: string): unknown | null {
  const re = new RegExp(
    `<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`,
    "i"
  );
  const m = html.match(re);
  if (!m?.[1]?.trim()) return null;
  try {
    return JSON.parse(m[1].trim()) as unknown;
  } catch {
    return null;
  }
}

function walkCollectItems(
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

function extractUserMeta(data: unknown): {
  secUid?: string;
  displayName?: string;
  userId?: string;
} {
  const scope =
    data && typeof data === "object"
      ? ((data as Record<string, unknown>).__DEFAULT_SCOPE__ as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const detail = scope?.["webapp.user-detail"] as Record<string, unknown> | undefined;
  const userInfo = detail?.userInfo as Record<string, unknown> | undefined;
  const user = userInfo?.user as Record<string, unknown> | undefined;
  const secUid = typeof user?.secUid === "string" ? user.secUid : undefined;
  const displayName =
    typeof user?.nickname === "string" && user.nickname.trim()
      ? user.nickname.trim()
      : undefined;
  const userId =
    user?.id != null
      ? String(user.id)
      : user?.uid != null
        ? String(user.uid)
        : undefined;
  if (!secUid) {
    const blob = JSON.stringify(data ?? {});
    const m = blob.match(/"secUid"\s*:\s*"([^"]+)"/);
    if (m?.[1]) return { secUid: m[1], displayName, userId };
  }
  return { secUid, displayName, userId };
}

function upsertVideo(
  map: Map<string, TikTokProfileVideo>,
  video: TikTokProfileVideo
) {
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

async function fetchItemListPage(opts: {
  secUid: string;
  cursor: number | string;
  count: number;
  profileUrl: string;
  signal?: AbortSignal;
}): Promise<{
  items: Record<string, unknown>[];
  cursor: number | string;
  hasMore: boolean;
}> {
  const endpoint = new URL("https://www.tiktok.com/api/post/item_list/");
  endpoint.searchParams.set("aid", "1988");
  endpoint.searchParams.set("count", String(opts.count));
  endpoint.searchParams.set("cursor", String(opts.cursor));
  endpoint.searchParams.set("device_platform", "web_pc");
  endpoint.searchParams.set("secUid", opts.secUid);

  const res = await fetch(endpoint.toString(), {
    headers: {
      ...EXTRACTOR_HEADERS,
      Accept: "application/json, text/plain, */*",
      Referer: opts.profileUrl,
    },
    redirect: "follow",
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`TikTok item_list failed (${res.status})`);
  }
  const json = (await res.json()) as {
    itemList?: Record<string, unknown>[];
    cursor?: number | string;
    hasMore?: boolean | number;
  };
  const items = Array.isArray(json.itemList) ? json.itemList : [];
  const hasMore = Boolean(json.hasMore) && items.length > 0;
  return {
    items,
    cursor: json.cursor ?? opts.cursor,
    hasMore,
  };
}

/**
 * List videos on a public TikTok profile (@handle).
 * Uses rehydration JSON first, then paginates `/api/post/item_list/` when secUid is available.
 */
export async function resolveTikTokProfile(
  url: string,
  opts: { maxVideos?: number; signal?: AbortSignal } = {}
): Promise<TikTokProfileResolveResult> {
  const profileUrl = normalizeTikTokProfileUrl(url);
  const username = extractTikTokUsername(profileUrl);
  if (!username) {
    throw new Error("Not a TikTok profile URL (expected https://www.tiktok.com/@user)");
  }

  const maxVideos = Math.max(1, Math.min(500, opts.maxVideos ?? DEFAULT_MAX));
  opts.signal?.throwIfAborted?.();

  let html = "";
  let browserItems: Record<string, unknown>[] = [];

  // SSR HTML usually has userInfo + secUid but empty itemList — browser loads the feed.
  try {
    const rendered = await fetchTikTokProfileViaBrowser(profileUrl, {
      settleMs: 1600,
      maxScrolls: Math.min(8, Math.ceil(maxVideos / 8)),
      signal: opts.signal,
    });
    html = rendered.html;
    browserItems = rendered.apiItems;
  } catch {
    try {
      const res = await fetch(profileUrl, {
        headers: {
          ...EXTRACTOR_HEADERS,
          Referer: "https://www.tiktok.com/",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
        signal: opts.signal,
      });
      if (res.ok) html = await res.text();
    } catch {
      /* handled below */
    }
  }

  if (!html && browserItems.length === 0) {
    throw new Error("Failed to load TikTok profile page.");
  }

  const map = new Map<string, TikTokProfileVideo>();
  const rehydration =
    parseJsonScript(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__") ||
    parseJsonScript(html, "SIGI_STATE");

  if (rehydration && typeof rehydration === "object") {
    const scope = (rehydration as Record<string, unknown>).__DEFAULT_SCOPE__ as
      | Record<string, unknown>
      | undefined;
    const detail = scope?.["webapp.user-detail"] as Record<string, unknown> | undefined;
    const itemList = detail?.itemList;
    if (Array.isArray(itemList)) {
      for (const item of itemList) {
        if (item && typeof item === "object") {
          const video = videoFromItem(item as Record<string, unknown>, username);
          if (video) upsertVideo(map, video);
        }
      }
    }
    // Broader walk only if the dedicated list was empty
    if (map.size === 0) {
      walkCollectItems(rehydration, username, map);
    }
  }

  for (const item of browserItems) {
    const video = videoFromItem(item, username);
    if (video) upsertVideo(map, video);
  }

  // HTML still lists /@user/video/id even when itemList JSON is empty
  {
    const esc = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const m of html.matchAll(new RegExp(`/@${esc}/video/(\\d+)`, "gi"))) {
      if (!m[1]) continue;
      upsertVideo(map, {
        id: m[1],
        url: `https://www.tiktok.com/@${username}/video/${m[1]}`,
      });
    }
  }

  // Regex fallback for /@user/video/id links in HTML
  if (map.size === 0) {
    const esc = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const m of html.matchAll(new RegExp(`/@${esc}/video/(\\d+)`, "gi"))) {
      if (m[1]) {
        upsertVideo(map, {
          id: m[1],
          url: `https://www.tiktok.com/@${username}/video/${m[1]}`,
        });
      }
    }
  }

  const userMeta = rehydration ? extractUserMeta(rehydration) : {};
  const secUid = userMeta.secUid;
  const displayName = userMeta.displayName || `@${username}`;
  const authorId = userMeta.userId;

  // Drop profile user id mistaken as a video id
  if (authorId) map.delete(authorId);

  let truncated = false;
  // Prefer browser-captured feed; only hit item_list API when we still need more.
  if (secUid && map.size < maxVideos) {
    let cursor: number | string = 0;
    let pages = 0;
    let hasMore = true;
    while (hasMore && map.size < maxVideos && pages < 40) {
      opts.signal?.throwIfAborted?.();
      pages += 1;
      try {
        const page = await fetchItemListPage({
          secUid,
          cursor,
          count: Math.min(PAGE_SIZE, maxVideos - map.size),
          profileUrl,
          signal: opts.signal,
        });
        const before = map.size;
        for (const item of page.items) {
          const video = videoFromItem(item, username);
          if (video) upsertVideo(map, video);
          if (map.size >= maxVideos) break;
        }
        hasMore = page.hasMore && map.size > before;
        cursor = page.cursor;
        if (!hasMore) break;
        truncated = true;
      } catch {
        // Keep HTML / browser-sourced videos if API is blocked
        break;
      }
    }
    if (hasMore && map.size >= maxVideos) truncated = true;
    else if (!hasMore) truncated = map.size >= maxVideos;
  } else if (map.size >= maxVideos) {
    truncated = true;
  }

  let videos = [...map.values()].filter((v) => v.id !== authorId);
  if (videos.length > maxVideos) {
    videos = videos.slice(0, maxVideos);
    truncated = true;
  }

  if (videos.length === 0) {
    throw new Error(
      `No public videos found on @${username}. Profile may be private, empty, or region-blocked.`
    );
  }

  return {
    username,
    displayName,
    videos,
    truncated,
  };
}

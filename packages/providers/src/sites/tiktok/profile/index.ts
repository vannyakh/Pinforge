/**
 * TikTok profile (@handle) listing via page rehydration JSON + item_list API.
 */

import { EXTRACTOR_HEADERS } from "@pinforge/download";
import { fetchTikTokProfileViaBrowser } from "../fetchHtml";
import { fetchItemListPage } from "./api";
import {
  extractUserMeta,
  parseJsonScript,
  upsertVideo,
  videoFromItem,
  walkCollectItems,
  type TikTokProfileVideo,
} from "./parse";
import { extractTikTokUsername, normalizeTikTokProfileUrl } from "./urls";

export type { TikTokProfileVideo } from "./parse";
export { isTikTokProfileUrl, normalizeTikTokProfileUrl, extractTikTokUsername } from "./urls";

export interface TikTokProfileResolveResult {
  username: string;
  displayName?: string;
  videos: TikTokProfileVideo[];
  truncated?: boolean;
}

const DEFAULT_MAX = 50;
const PAGE_SIZE = 35;

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
      Record<string, unknown> | undefined;
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

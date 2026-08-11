import type { PinListItem } from "@pinforge/types";
import { coverFromPinimg, coverFromPinObject } from "../shared/pinimg";

export function upsertPin(
  map: Map<string, PinListItem>,
  pinId: string,
  patch: Partial<Omit<PinListItem, "pinId" | "url">>
) {
  const url = `https://www.pinterest.com/pin/${pinId}/`;
  const prev = map.get(pinId);
  map.set(pinId, {
    pinId,
    url,
    title: patch.title ?? prev?.title,
    coverUrl: patch.coverUrl ?? prev?.coverUrl,
  });
}

function walkPins(node: unknown, map: Map<string, PinListItem>, depth = 0) {
  if (depth > 14 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) walkPins(item, map, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  const rawId = obj.id ?? obj.pin_id ?? obj.pinId;
  const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "";
  const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
  // BoardFeed JSON also embeds board/user nodes with numeric ids — skip those.
  const nonPinType =
    type &&
    !/^(pin|userpin|storypin|story_pin|interestpin)$/i.test(type) &&
    /^(board|user|board_section|boardsection|interest|conversation|aggregated_pin_data|pin_join)/i.test(
      type
    );

  if (/^\d{6,}$/.test(id) && !nonPinType) {
    const titleRaw = obj.grid_title ?? obj.title ?? obj.description ?? obj.closeup_description;
    const title = typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : undefined;

    const coverUrl = coverFromPinObject(obj);

    if (title || coverUrl || !map.has(id)) {
      upsertPin(map, id, { title, coverUrl });
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") walkPins(value, map, depth + 1);
  }
}

/**
 * BoardFeed / UserPins pages nest related pins inside each item.
 * Only take top-level feed entries so “More like this” is not counted.
 */
export function collectFeedPins(data: unknown, map: Map<string, PinListItem>) {
  const items: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : data && typeof data === "object"
        ? [data]
        : [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
    if (
      type &&
      !/^(pin|userpin|storypin|story_pin|interestpin)$/i.test(type) &&
      /^(board|user|board_section|boardsection|interest|conversation)/i.test(type)
    ) {
      continue;
    }
    const rawId = obj.id ?? obj.pin_id ?? obj.pinId;
    const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "";
    if (!/^\d{6,}$/.test(id)) continue;

    const titleRaw = obj.grid_title ?? obj.title ?? obj.description ?? obj.closeup_description;
    const title =
      typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim().slice(0, 200) : undefined;
    const coverUrl = coverFromPinObject(obj);
    upsertPin(map, id, { title, coverUrl });
  }
}

/** Prefer nodes that look like board/profile feed results, not “related” widgets. */
function findFeedNodes(root: unknown): unknown[] {
  const hits: unknown[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 12 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const keys = Object.keys(obj);
    const joined = keys.join(" ").toLowerCase();
    if (
      /boardfeed|board_feed|userpins|section.?pins|basesearch|grid_pin|react_grid/i.test(joined) ||
      (Array.isArray(obj.data) && obj.data.length > 0 && typeof obj.data[0] === "object")
    ) {
      hits.push(obj.data ?? obj);
    }
    // Named resource bags inside __PWS_DATA__
    for (const [k, v] of Object.entries(obj)) {
      if (/BoardFeed|UserPins|BoardSectionPins|BaseSearch|BoardResource/i.test(k)) {
        hits.push(v);
      } else if (v && typeof v === "object") {
        visit(v, depth + 1);
      }
    }
  };
  visit(root, 0);
  return hits;
}

export function extractPinsFromHtml(html: string): PinListItem[] {
  const map = new Map<string, PinListItem>();

  const scopedBlobs: string[] = [];
  for (const m of html.matchAll(
    /"(?:BoardFeed|BoardResource|UserPins|BoardSectionPins|BaseSearch)Resource"\s*:\s*(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})/g
  )) {
    if (m[1]) scopedBlobs.push(m[1]);
  }

  const jsonBlobs = [
    ...html.matchAll(/<script[^>]*id=["']__PWS_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(
      /<script[^>]*data-relay-response=["']true["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  for (const m of jsonBlobs) {
    const raw = m[1]?.trim();
    if (!raw || raw.length < 20) continue;
    try {
      const root = JSON.parse(raw) as unknown;
      // Walk only feed-like branches when present; otherwise full tree (last resort).
      const feedish = findFeedNodes(root);
      if (feedish.length > 0) {
        for (const node of feedish) {
          if (Array.isArray(node)) collectFeedPins(node, map);
          else if (
            node &&
            typeof node === "object" &&
            Array.isArray((node as { data?: unknown }).data)
          ) {
            collectFeedPins((node as { data: unknown[] }).data, map);
          } else {
            // Avoid deep-walking related pins nested under feed objects
            collectFeedPins(node, map);
          }
        }
      } else {
        walkPins(root, map);
      }
    } catch {
      /* ignore bad JSON */
    }
  }

  for (const raw of scopedBlobs) {
    try {
      walkPins(JSON.parse(raw), map);
    } catch {
      /* ignore */
    }
  }

  // Regex /pin/id/ fallback only when structured data found nothing.
  if (map.size === 0) {
    for (const m of html.matchAll(/\/pin\/(\d+)\//g)) {
      if (m[1]) upsertPin(map, m[1], {});
    }
  }

  return [...map.values()];
}

/**
 * BoardFeed with redux_normalize_feed often returns id stubs without images.
 * Fill title/cover from page JSON for pins already in `map` only (no related pins).
 */
export function enrichMissingMetaFromHtml(html: string, map: Map<string, PinListItem>) {
  if (map.size === 0) return;
  const missing = [...map.values()].some((p) => !p.coverUrl || !p.title);
  if (!missing) return;

  const temp = new Map<string, PinListItem>();

  const jsonBlobs = [
    ...html.matchAll(/<script[^>]*id=["']__PWS_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(/<script[^>]*id=["']__PWS_INITIAL_PROPS__["'][^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(
      /<script[^>]*data-relay-response=["']true["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  for (const m of jsonBlobs) {
    const raw = m[1]?.trim();
    if (!raw || raw.length < 20) continue;
    try {
      walkPins(JSON.parse(raw) as unknown, temp);
    } catch {
      /* ignore */
    }
  }

  for (const [id, p] of temp) {
    if (!map.has(id)) continue;
    upsertPin(map, id, { title: p.title, coverUrl: p.coverUrl });
  }

  // Regex fallback: associate pin id with a nearby pinimg URL in the raw HTML/JSON
  for (const [id, p] of map) {
    if (p.coverUrl) continue;
    const re = new RegExp(
      `"id"\\s*:\\s*"${id}"[\\s\\S]{0,3500}?(https?:\\\\?/\\\\?/i\\.pinimg\\.com\\\\?/(?:236x|474x|736x|originals|564x)\\\\?/[^"'\\\\s]+)`,
      "i"
    );
    const m = html.match(re);
    if (!m?.[1]) continue;
    const cover = coverFromPinimg(m[1]);
    if (cover) upsertPin(map, id, { coverUrl: cover });
  }
}

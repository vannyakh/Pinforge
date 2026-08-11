import type { BoardResolveResult, PinListItem } from "@pinforge/types";
import { isPinterestHost, normalizePinUrl } from "./resolvePin";
import { pinterestCsrfToken, pinterestRequestHeaders } from "./session";

const DEFAULT_MAX_PINS = 200;
const PAGE_SIZE = 25;

export interface ResolveBoardOptions {
  /** Cap pins returned (default 200). */
  maxPins?: number;
  signal?: AbortSignal;
}

function normalizeBoardUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!isPinterestHost(parsed.hostname)) {
    throw new Error("URL must be a pinterest.com board, profile, or search link");
  }

  let path = parsed.pathname.replace(/\/+$/, "");
  if (!path) throw new Error("Invalid board URL");

  const search = parsed.search || "";
  return `https://www.pinterest.com${path}/${search}`;
}

function coverFromPinimg(raw: string): string | undefined {
  let u = raw
    .replace(/\\\//g, "/")
    .replace(/\\u002F/g, "/")
    .replace(/\\u0026/g, "&")
    .trim();
  if (u.startsWith("//")) u = `https:${u}`;
  // Strip trailing CSS / JSON junk pasted onto the URL
  const clipped = u.match(/^(https?:\/\/(?:i\.)?pinimg\.com\/[^\s"'<>)\\{}]+)/i);
  if (!clipped?.[1]) return undefined;
  u = clipped[1].replace(/[,;]+$/, "");
  // UI previews: mid-size grid URLs load more reliably than /originals/ (hotlink blocks)
  u = u
    .replace(/\/75x75(?:_RS)?\//i, "/474x/")
    .replace(/\/originals\//i, "/474x/")
    .replace(/\/1200x\//i, "/474x/");
  if (!/^https?:\/\//i.test(u)) return undefined;
  return u;
}

/** Build a grid thumbnail from Pinterest image_signature when images{} is missing. */
function coverFromImageSignature(sig: unknown): string | undefined {
  if (typeof sig !== "string") return undefined;
  const s = sig.trim().toLowerCase();
  if (!/^[0-9a-f]{16,}$/.test(s)) return undefined;
  const a = s.slice(0, 2);
  const b = s.slice(2, 4);
  const c = s.slice(4, 6);
  return `https://i.pinimg.com/236x/${a}/${b}/${c}/${s}.jpg`;
}

function firstPinimgIn(value: unknown, depth = 0): string | undefined {
  if (depth > 8 || value == null) return undefined;
  if (typeof value === "string") {
    if (/pinimg\.com/i.test(value)) return coverFromPinimg(value);
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = firstPinimgIn(item, depth + 1);
      if (hit) return hit;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  // Prefer known thumbnail keys first
  for (const key of ["url", "thumbnail", "thumbnail_url", "image_url", "src", "cover_image_url"]) {
    const v = obj[key];
    if (typeof v === "string" && /pinimg\.com/i.test(v)) {
      const cover = coverFromPinimg(v);
      if (cover) return cover;
    }
  }
  for (const v of Object.values(obj)) {
    const hit = firstPinimgIn(v, depth + 1);
    if (hit) return hit;
  }
  return undefined;
}

function coverFromPinObject(obj: Record<string, unknown>): string | undefined {
  const images = obj.images;
  if (images && typeof images === "object") {
    const imgMap = images as Record<string, { url?: string } | string>;
    // Prefer mid-size for chat/grid previews (originals often fail in <img>)
    const order = ["474x", "736x", "564x", "236x", "orig", "originals", "170x", "150x150"];
    for (const key of order) {
      const slot = imgMap[key];
      const u =
        typeof slot === "string" ? slot : slot && typeof slot === "object" ? slot.url : undefined;
      if (typeof u === "string") {
        const cover = coverFromPinimg(u);
        if (cover) return cover;
      }
    }
    const any = firstPinimgIn(images);
    if (any) return any;
  }

  for (const key of [
    "image_medium_url",
    "image_large_url",
    "image_small_url",
    "image_square_url",
    "cover_image_url",
    "thumbnail_url",
  ]) {
    const v = obj[key];
    if (typeof v === "string") {
      const cover = coverFromPinimg(v);
      if (cover) return cover;
    }
  }

  const fromSig = coverFromImageSignature(obj.image_signature);
  if (fromSig) return fromSig;

  // Video pin poster / story pin covers
  for (const key of ["videos", "story_pin_data", "rich_summary", "embed"]) {
    const hit = firstPinimgIn(obj[key]);
    if (hit) return hit;
  }

  return undefined;
}

function upsertPin(
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
function collectFeedPins(data: unknown, map: Map<string, PinListItem>) {
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

function extractPinsFromHtml(html: string): PinListItem[] {
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

/**
 * BoardFeed with redux_normalize_feed often returns id stubs without images.
 * Fill title/cover from page JSON for pins already in `map` only (no related pins).
 */
function enrichMissingMetaFromHtml(html: string, map: Map<string, PinListItem>) {
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

async function fetchPinMeta(
  pinId: string,
  opts: { appVersion?: string; signal?: AbortSignal }
): Promise<{ title?: string; coverUrl?: string } | null> {
  const sourceUrl = `/pin/${pinId}/`;
  const endpoint = new URL("https://www.pinterest.com/resource/PinResource/get/");
  endpoint.searchParams.set("source_url", sourceUrl);
  endpoint.searchParams.set(
    "data",
    JSON.stringify({
      options: { id: pinId, field_set_key: "detailed" },
      context: {},
    })
  );
  endpoint.searchParams.set("_", String(Date.now()));

  const csrf = pinterestCsrfToken();
  const headers = pinterestRequestHeaders({
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "X-Pinterest-AppState": "active",
    "X-Pinterest-PWS-Handler": "www/pin/[id].js",
    "X-Pinterest-Source-Url": sourceUrl,
    Referer: `https://www.pinterest.com${sourceUrl}`,
  });
  if (opts.appVersion) headers["X-APP-VERSION"] = opts.appVersion;
  if (csrf) {
    headers["X-CSRFToken"] = csrf;
    headers["X-Pinterest-CSRF"] = csrf;
  }
  if (!headers.Cookie) {
    const token = `pinforge${Math.random().toString(36).slice(2, 10)}`;
    headers.Cookie = `csrftoken=${token}`;
    headers["X-CSRFToken"] = token;
  }

  const res = await fetch(endpoint.toString(), {
    headers,
    redirect: "follow",
    signal: opts.signal,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    resource_response?: { data?: Record<string, unknown> | null };
  };
  const pin = json.resource_response?.data;
  if (!pin || typeof pin !== "object") return null;
  if (pin.id != null && String(pin.id) !== pinId) return null;

  const titleRaw = pin.grid_title ?? pin.title ?? pin.description ?? pin.closeup_description;
  const title =
    typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim().slice(0, 200) : undefined;
  const coverUrl = coverFromPinObject(pin);
  if (!title && !coverUrl) return null;
  return { title, coverUrl };
}

/** Fill missing covers/titles via PinResource (BoardFeed often returns stubs). */
async function hydrateMissingPinMeta(opts: {
  map: Map<string, PinListItem>;
  appVersion?: string;
  signal?: AbortSignal;
  concurrency?: number;
}) {
  const missing = [...opts.map.values()].filter((p) => !p.coverUrl);
  if (!missing.length) return;

  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 6, 10));
  let cursor = 0;

  async function worker() {
    while (cursor < missing.length) {
      const idx = cursor;
      cursor += 1;
      const item = missing[idx];
      if (!item) return;
      opts.signal?.throwIfAborted?.();
      try {
        const meta = await fetchPinMeta(item.pinId, {
          appVersion: opts.appVersion,
          signal: opts.signal,
        });
        if (meta) {
          upsertPin(opts.map, item.pinId, {
            title: meta.title,
            coverUrl: meta.coverUrl,
          });
        }
      } catch {
        /* ignore single-pin failures */
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

function extractBoardName(html: string, boardUrl: string): string | undefined {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  if (og) return og.replace(/\s*[|\-–].*$/, "").trim();

  try {
    const u = new URL(boardUrl);
    const q = u.searchParams.get("q");
    if (q) return `search-${q}`;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1]?.replace(/-/g, " ");
  } catch {
    return undefined;
  }
}

function extractQuoted(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`);
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function extractNumericId(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(`"${key}"\\s*:\\s*"?(\\d{6,})"?`);
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/** Modern Pinterest HTML often omits board_id; resolve id from the board object for this URL. */
function extractBoardId(html: string, boardUrl?: string): string | undefined {
  let path = "";
  try {
    if (boardUrl) {
      path = new URL(boardUrl).pathname.replace(/\/+$/, "");
    }
  } catch {
    path = "";
  }

  if (path && path !== "/") {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const byUrl =
      html.match(
        new RegExp(
          `"url"\\s*:\\s*"${escaped}/?"[\\s\\S]{0,500}?"(?:id|board_id)"\\s*:\\s*"(\\d{6,})"`,
          "i"
        )
      )?.[1] ||
      html.match(
        new RegExp(
          `"(?:id|board_id)"\\s*:\\s*"(\\d{6,})"\\s*[\\s\\S]{0,500}?"url"\\s*:\\s*"${escaped}/?"`,
          "i"
        )
      )?.[1];
    if (byUrl) return byUrl;

    // slug-only: ".../rc-vehicles/"
    const slug = path.split("/").filter(Boolean).pop();
    if (slug && slug.length >= 2) {
      const slugEsc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const bySlug =
        html.match(
          new RegExp(
            `"url"\\s*:\\s*"/[^"]*${slugEsc}/?"[\\s\\S]{0,400}?"(?:id|board_id)"\\s*:\\s*"(\\d{6,})"`,
            "i"
          )
        )?.[1] ||
        html.match(
          new RegExp(
            `"name"\\s*:\\s*"[^"]*"[\\s\\S]{0,200}?"url"\\s*:\\s*"/[^"]*${slugEsc}/?"[\\s\\S]{0,300}?"(?:id|board_id)"\\s*:\\s*"(\\d{6,})"`,
            "i"
          )
        )?.[1];
      if (bySlug) return bySlug;
    }
  }

  return (
    extractNumericId(html, ["board_id", "boardId"]) ||
    html.match(/"id"\s*:\s*"(\d{6,})"\s*,\s*"type"\s*:\s*"board"/i)?.[1] ||
    html.match(/"type"\s*:\s*"board"\s*,\s*"id"\s*:\s*"(\d{6,})"/i)?.[1] ||
    html.match(/"id"\s*:\s*"(\d{6,})"[\s\S]{0,160}"type"\s*:\s*"board"/i)?.[1] ||
    html.match(/"type"\s*:\s*"board"[\s\S]{0,160}"id"\s*:\s*"(\d{6,})"/i)?.[1]
  );
}

function extractSectionId(html: string): string | undefined {
  return (
    extractNumericId(html, ["section_id", "sectionId"]) ||
    html.match(/"id"\s*:\s*"(\d{6,})"\s*,\s*"type"\s*:\s*"board_section"/i)?.[1] ||
    html.match(/"type"\s*:\s*"board_section"\s*,\s*"id"\s*:\s*"(\d{6,})"/i)?.[1] ||
    html.match(/"id"\s*:\s*"(\d{6,})"[\s\S]{0,160}"type"\s*:\s*"board_section"/i)?.[1]
  );
}

function sourcePathFromUrl(boardUrl: string): string {
  try {
    const u = new URL(boardUrl);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return "/";
  }
}

function isBookmarkEnd(bookmarks: unknown): boolean {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) return true;
  const b = String(bookmarks[0] ?? "");
  return !b || b === "-end-" || b.startsWith("Y2JOb25lO");
}

async function fetchResourcePage(opts: {
  resource: string;
  sourceUrl: string;
  options: Record<string, unknown>;
  appVersion?: string;
  signal?: AbortSignal;
}): Promise<{ data: unknown; bookmarks: unknown }> {
  const endpoint = `https://www.pinterest.com/resource/${opts.resource}Resource/get/`;
  const data = JSON.stringify({ options: opts.options, context: {} });
  const url = new URL(endpoint);
  url.searchParams.set("source_url", opts.sourceUrl);
  url.searchParams.set("data", data);
  url.searchParams.set("_", String(Date.now()));

  const csrf = pinterestCsrfToken();
  const headers = pinterestRequestHeaders({
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "X-Pinterest-AppState": "active",
    "X-Pinterest-PWS-Handler": `www/${opts.resource.toLowerCase()}.js`,
    Referer: `https://www.pinterest.com${opts.sourceUrl}`,
  });
  if (opts.appVersion) headers["X-APP-VERSION"] = opts.appVersion;
  if (csrf) {
    headers["X-CSRFToken"] = csrf;
    headers["X-Pinterest-CSRF"] = csrf;
  }

  const res = await fetch(url.toString(), {
    headers,
    redirect: "follow",
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`Pinterest ${opts.resource} failed (${res.status})`);
  }
  const json = (await res.json()) as {
    resource_response?: { data?: unknown };
    resource?: { options?: { bookmarks?: unknown } };
  };
  return {
    data: json.resource_response?.data,
    bookmarks: json.resource?.options?.bookmarks,
  };
}

async function paginatePins(opts: {
  resource: string;
  sourceUrl: string;
  baseOptions: Record<string, unknown>;
  map: Map<string, PinListItem>;
  maxPins: number;
  initialBookmark?: string;
  appVersion?: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  let bookmarks: string[] | null = opts.initialBookmark ? [opts.initialBookmark] : null;
  let truncated = false;
  let pages = 0;

  while (opts.map.size < opts.maxPins && pages < 80) {
    opts.signal?.throwIfAborted?.();
    pages += 1;
    const options: Record<string, unknown> = {
      ...opts.baseOptions,
      page_size: PAGE_SIZE,
    };
    if (bookmarks) options.bookmarks = bookmarks;

    let data: unknown;
    let nextBookmarks: unknown;
    try {
      const page = await fetchResourcePage({
        resource: opts.resource,
        sourceUrl: opts.sourceUrl,
        options,
        appVersion: opts.appVersion,
        signal: opts.signal,
      });
      data = page.data;
      nextBookmarks = page.bookmarks;
    } catch {
      truncated = opts.map.size >= opts.maxPins || pages > 1;
      break;
    }

    const before = opts.map.size;
    if (data != null) collectFeedPins(data, opts.map);
    if (opts.map.size > opts.maxPins) {
      // trim later
      truncated = true;
      break;
    }
    if (opts.map.size === before && pages > 1) break;
    if (isBookmarkEnd(nextBookmarks)) {
      truncated = false;
      break;
    }
    bookmarks = Array.isArray(nextBookmarks) ? (nextBookmarks as string[]) : null;
    if (!bookmarks) break;
    truncated = true;
  }

  return truncated && opts.map.size >= opts.maxPins;
}

export function classifyPinterestCollection(url: string): BoardResolveResult["kind"] | null {
  try {
    const u = new URL(url.trim());
    if (!isPinterestHost(u.hostname)) return null;
    if (/\/pin\/\d+/i.test(u.pathname)) return null;
    if (/\/search\//i.test(u.pathname)) return "search";
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) {
      if (/^(ideas|today|categories|news_hub|business|settings)/i.test(parts[0]!)) {
        return null;
      }
      return "profile";
    }
    if (parts.some((p) => /^section/i.test(p))) return "section";
    return "board";
  } catch {
    return null;
  }
}

/**
 * Resolve a board, section, profile, or search page to pin URLs + preview meta.
 * Paginates via Pinterest resource APIs when board/user ids are available.
 */
export async function resolveBoard(
  url: string,
  opts: ResolveBoardOptions = {}
): Promise<BoardResolveResult> {
  const boardUrl = normalizeBoardUrl(url);
  const kind = classifyPinterestCollection(url) ?? "board";
  const maxPins = Math.max(1, Math.min(2000, opts.maxPins ?? DEFAULT_MAX_PINS));

  const pageRes = await fetch(boardUrl, {
    headers: pinterestRequestHeaders(),
    redirect: "follow",
    signal: opts.signal,
  });

  if (!pageRes.ok) {
    throw new Error(`Failed to fetch Pinterest page (${pageRes.status}): ${boardUrl}`);
  }

  const html = await pageRes.text();
  const map = new Map<string, PinListItem>();

  const boardName = extractBoardName(html, boardUrl);
  const sourceUrl = sourcePathFromUrl(boardUrl);
  const appVersion = extractQuoted(html, ["app_version", "appVersion", "version"]);
  const boardId = extractBoardId(html, boardUrl);
  const sectionId = extractSectionId(html);
  let username =
    extractQuoted(html, ["username"]) ||
    (() => {
      try {
        return new URL(boardUrl).pathname.split("/").filter(Boolean)[0];
      } catch {
        return undefined;
      }
    })();

  let truncated = false;

  // Boards with a board_id: BoardFeed only (HTML scrape pulls related / “more ideas” pins).
  const useApiOnly =
    (kind === "board" && Boolean(boardId)) ||
    (kind === "section" && Boolean(sectionId)) ||
    (kind === "profile" && Boolean(username));

  if (!useApiOnly) {
    for (const p of extractPinsFromHtml(html)) {
      upsertPin(map, p.pinId, { title: p.title, coverUrl: p.coverUrl });
    }
  }

  if (map.size < maxPins) {
    if (kind === "board" && boardId) {
      truncated = await paginatePins({
        resource: "BoardFeed",
        sourceUrl,
        baseOptions: {
          board_id: boardId,
          board_url: sourceUrl,
          field_set_key: "react_grid_pin",
          filter_section_pins: true,
          prepend: false,
          // true returns id stubs without images/titles
          redux_normalize_feed: false,
        },
        map,
        maxPins,
        appVersion,
        signal: opts.signal,
      });
      // API empty/failed — scoped HTML fallback (not every /pin/ on the page).
      if (map.size === 0) {
        for (const p of extractPinsFromHtml(html)) {
          upsertPin(map, p.pinId, { title: p.title, coverUrl: p.coverUrl });
        }
      } else {
        enrichMissingMetaFromHtml(html, map);
      }
    } else if (kind === "section" && sectionId) {
      truncated = await paginatePins({
        resource: "BoardSectionPins",
        sourceUrl,
        baseOptions: {
          section_id: sectionId,
          field_set_key: "react_grid_pin",
          redux_normalize_feed: false,
        },
        map,
        maxPins,
        appVersion,
        signal: opts.signal,
      });
      if (map.size === 0) {
        for (const p of extractPinsFromHtml(html)) {
          upsertPin(map, p.pinId, { title: p.title, coverUrl: p.coverUrl });
        }
      } else {
        enrichMissingMetaFromHtml(html, map);
      }
    } else if (kind === "profile" && username) {
      truncated = await paginatePins({
        resource: "UserPins",
        sourceUrl,
        baseOptions: {
          username,
          field_set_key: "grid_item",
          is_own_profile_pins: false,
          pin_filter: null,
        },
        map,
        maxPins,
        appVersion,
        signal: opts.signal,
      });
      if (map.size === 0) {
        for (const p of extractPinsFromHtml(html)) {
          upsertPin(map, p.pinId, { title: p.title, coverUrl: p.coverUrl });
        }
      } else {
        enrichMissingMetaFromHtml(html, map);
      }
    } else if (kind === "search") {
      try {
        const q = new URL(boardUrl).searchParams.get("q");
        if (q) {
          truncated = await paginatePins({
            resource: "BaseSearch",
            sourceUrl,
            baseOptions: {
              query: q,
              scope: "pins",
              rs: "typed",
            },
            map,
            maxPins,
            appVersion,
            signal: opts.signal,
          });
        }
      } catch {
        /* ignore */
      }
      if (map.size === 0) {
        for (const p of extractPinsFromHtml(html)) {
          upsertPin(map, p.pinId, { title: p.title, coverUrl: p.coverUrl });
        }
      }
    } else if (map.size >= 40) {
      truncated = true;
    }
  }

  let pins = [...map.values()];
  if (pins.length > maxPins) {
    pins = pins.slice(0, maxPins);
    truncated = true;
  } else if (pins.length >= maxPins) {
    truncated = true;
  } else if (pins.length >= 40 && !boardId && kind === "board") {
    // First HTML page only when API ids missing
    truncated = true;
  }

  // BoardFeed / HTML stubs often lack images — hydrate covers for the grid UI.
  if (pins.some((p) => !p.coverUrl)) {
    const hydrateMap = new Map(pins.map((p) => [p.pinId, p] as const));
    await hydrateMissingPinMeta({
      map: hydrateMap,
      appVersion,
      signal: opts.signal,
    });
    pins = [...hydrateMap.values()];
  }

  const pinUrls = pins.map((p) => p.url);

  if (pinUrls.length === 0) {
    throw new Error(
      kind === "profile"
        ? "No pins found on this profile. Sign in via cookies in Settings if the profile is private."
        : "No pins found on this page. Make sure the board/search is public, or paste cookies in Settings for private boards."
    );
  }

  return {
    pinUrls,
    pins,
    boardName,
    kind,
    truncated,
  };
}

export function isBoardUrl(url: string): boolean {
  const kind = classifyPinterestCollection(url);
  return kind === "board" || kind === "section" || kind === "search";
}

export function isProfileUrl(url: string): boolean {
  return classifyPinterestCollection(url) === "profile";
}

/** Board, section, profile, or search — anything that lists multiple pins. */
export function isPinterestCollectionUrl(url: string): boolean {
  return classifyPinterestCollection(url) != null;
}

export function isPinUrl(url: string): boolean {
  try {
    normalizePinUrl(url);
    return /\/pin\/\d+/.test(new URL(url.trim()).pathname);
  } catch {
    return false;
  }
}

export function isPinterestUrl(url: string): boolean {
  try {
    return isPinterestHost(new URL(url.trim()).hostname);
  } catch {
    return false;
  }
}

import type { BoardResolveResult, PinListItem } from "../../types";
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

function coverFromPinimg(raw: string): string {
  let u = raw
    .replace(/\\\//g, "/")
    .replace(/\\u002F/g, "/")
    .replace(/\\u0026/g, "&")
    .trim();
  if (u.startsWith("//")) u = `https:${u}`;
  // Prefer a mid/high grid size for UI covers (not 75x)
  u = u.replace(/\/75x75\//, "/236x/");
  return u;
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
  const id =
    typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "";
  if (/^\d{6,}$/.test(id)) {
    const titleRaw =
      obj.grid_title ?? obj.title ?? obj.description ?? obj.closeup_description;
    const title =
      typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : undefined;

    let coverUrl: string | undefined;
    const images = obj.images;
    if (images && typeof images === "object") {
      const imgMap = images as Record<string, { url?: string } | string>;
      const order = ["orig", "originals", "736x", "564x", "474x", "236x"];
      for (const key of order) {
        const slot = imgMap[key];
        const u =
          typeof slot === "string"
            ? slot
            : slot && typeof slot === "object"
              ? slot.url
              : undefined;
        if (typeof u === "string" && /pinimg\.com/i.test(u)) {
          coverUrl = coverFromPinimg(u);
          if (!/^https?:\/\//i.test(coverUrl)) coverUrl = undefined;
          else break;
        }
      }
    }
    if (!coverUrl && typeof obj.image_medium_url === "string") {
      coverUrl = coverFromPinimg(obj.image_medium_url);
    }
    if (!coverUrl && typeof obj.image_large_url === "string") {
      coverUrl = coverFromPinimg(obj.image_large_url);
    }

    if (title || coverUrl || !map.has(id)) {
      upsertPin(map, id, { title, coverUrl });
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") walkPins(value, map, depth + 1);
  }
}

function extractPinsFromHtml(html: string): PinListItem[] {
  const map = new Map<string, PinListItem>();

  for (const m of html.matchAll(/\/pin\/(\d+)\//g)) {
    if (m[1]) upsertPin(map, m[1], {});
  }
  for (const m of html.matchAll(/\\\/pin\\\/(\d+)\\\//g)) {
    if (m[1]) upsertPin(map, m[1], {});
  }

  const jsonBlobs = [
    ...html.matchAll(/<script[^>]*id=["']__PWS_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(
      /<script[^>]*data-relay-response=["']true["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
    ...html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];

  for (const m of jsonBlobs) {
    const raw = m[1]?.trim();
    if (!raw || raw.length < 20) continue;
    try {
      walkPins(JSON.parse(raw), map);
    } catch {
      /* ignore bad JSON */
    }
  }

  for (const m of html.matchAll(
    /\/pin\/(\d+)\/[^"]{0,80}?(https?:\/\/i\.pinimg\.com\/[^"'\s]+)/gi
  )) {
    if (m[1] && m[2]) upsertPin(map, m[1], { coverUrl: coverFromPinimg(m[2]) });
  }

  return [...map.values()];
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
  let bookmarks: string[] | null = opts.initialBookmark
    ? [opts.initialBookmark]
    : null;
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
    if (data != null) walkPins(data, opts.map);
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
    bookmarks = Array.isArray(nextBookmarks)
      ? (nextBookmarks as string[])
      : null;
    if (!bookmarks) break;
    truncated = true;
  }

  return truncated && opts.map.size >= opts.maxPins;
}

export function classifyPinterestCollection(
  url: string
): BoardResolveResult["kind"] | null {
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
  for (const p of extractPinsFromHtml(html)) {
    upsertPin(map, p.pinId, { title: p.title, coverUrl: p.coverUrl });
  }

  const boardName = extractBoardName(html, boardUrl);
  const sourceUrl = sourcePathFromUrl(boardUrl);
  const appVersion = extractQuoted(html, ["app_version", "appVersion", "version"]);
  const boardId = extractNumericId(html, ["board_id", "boardId"]);
  const sectionId = extractNumericId(html, ["section_id", "sectionId"]);
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
          redux_normalize_feed: true,
        },
        map,
        maxPins,
        appVersion,
        signal: opts.signal,
      });
    } else if (kind === "section" && sectionId) {
      truncated = await paginatePins({
        resource: "BoardSectionPins",
        sourceUrl,
        baseOptions: {
          section_id: sectionId,
          field_set_key: "react_grid_pin",
        },
        map,
        maxPins,
        appVersion,
        signal: opts.signal,
      });
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

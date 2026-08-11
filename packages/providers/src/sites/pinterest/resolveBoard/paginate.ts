import type { PinListItem } from "@pinforge/types";
import { fetchPinMeta } from "../shared/pinResource";
import { pinterestApiHeaders } from "../shared/session";
import { collectFeedPins, upsertPin } from "./htmlScrape";

const PAGE_SIZE = 25;

function isBookmarkEnd(bookmarks: unknown): boolean {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) return true;
  const b = String(bookmarks[0] ?? "");
  return !b || b === "-end-" || b.startsWith("Y2JOb25lO");
}

/** Normalize bookmark from resource_response.bookmark or resource.options.bookmarks. */
function normalizeBookmarks(raw: unknown): string[] | null {
  if (typeof raw === "string" && raw && raw !== "-end-") return [raw];
  if (Array.isArray(raw) && raw.length > 0) {
    const first = String(raw[0] ?? "");
    if (!first || first === "-end-") return null;
    return raw.map(String);
  }
  return null;
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

  const headers = pinterestApiHeaders({
    sourceUrl: opts.sourceUrl,
    pwsHandler: `www/${opts.resource.toLowerCase()}.js`,
    appVersion: opts.appVersion,
    // Profile pages use www/[username].js in the wild (pinterest-js)
    extra:
      opts.resource === "UserActivityPins" || opts.resource === "UserPins"
        ? { "X-Pinterest-PWS-Handler": "www/[username].js" }
        : undefined,
  });

  const res = await fetch(url.toString(), {
    headers,
    redirect: "follow",
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`Pinterest ${opts.resource} failed (${res.status})`);
  }
  const json = (await res.json()) as {
    resource_response?: {
      data?: unknown;
      bookmark?: unknown;
      status?: string;
    };
    resource?: { options?: { bookmarks?: unknown } };
  };
  const bookmarks =
    normalizeBookmarks(json.resource_response?.bookmark) ??
    normalizeBookmarks(json.resource?.options?.bookmarks) ??
    json.resource?.options?.bookmarks;
  return {
    data: json.resource_response?.data,
    bookmarks,
  };
}

export async function paginatePins(opts: {
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

/** Fill missing covers/titles via PinResource (BoardFeed often returns stubs). */
export async function hydrateMissingPinMeta(opts: {
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

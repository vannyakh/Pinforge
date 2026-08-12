import type { BoardResolveResult, PinListItem } from "@pinforge/types";
import { isPinItHost, isPinterestHost } from "../shared/urls";
import {
  extractAppVersion,
  extractBoardId,
  extractBoardName,
  extractSectionId,
  extractUserId,
  extractUsername,
  normalizeBoardUrl,
  sourcePathFromUrl,
} from "./htmlMeta";
import { extractPinsFromHtml, enrichMissingMetaFromHtml, upsertPin } from "./htmlScrape";
import { hydrateMissingPinMeta, paginatePins } from "./paginate";
import { pinterestRequestHeaders } from "../shared/session";
import { isMultiPinShareUrl, resolveMultiPinShare } from "./multiPinShare";

export { isPinUrl, isPinterestUrl } from "../shared/urls";
export { isMultiPinShareUrl, parseMultiPinShare, resolveMultiPinShare } from "./multiPinShare";

const DEFAULT_MAX_PINS = 200;

export interface ResolveBoardOptions {
  /** Cap pins returned (default 200). */
  maxPins?: number;
  signal?: AbortSignal;
}

export function classifyPinterestCollection(url: string): BoardResolveResult["kind"] | null {
  try {
    const u = new URL(url.trim());
    if (!isPinterestHost(u.hostname)) return null;
    // pin.it shorts expand to a single pin or multi-pin-share — never treat the short code as a profile.
    if (isPinItHost(u.hostname)) return null;
    if (/\/pin\/\d+/i.test(u.pathname)) return null;
    if (/\/multi-pin-share\/\d+/i.test(u.pathname)) return "board";
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
  if (isMultiPinShareUrl(url)) {
    return resolveMultiPinShare(url, opts);
  }

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
  const appVersion = extractAppVersion(html);
  const boardId = extractBoardId(html, boardUrl);
  const sectionId = extractSectionId(html);
  let username =
    extractUsername(html) ||
    (() => {
      try {
        return new URL(boardUrl).pathname.split("/").filter(Boolean)[0];
      } catch {
        return undefined;
      }
    })();
  const userId = kind === "profile" ? extractUserId(html, username) : undefined;

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
      // Prefer UserActivityPins + user_id (pinterest-js); fall back to UserPins.
      if (userId) {
        truncated = await paginatePins({
          resource: "UserActivityPins",
          sourceUrl,
          baseOptions: {
            exclude_add_pin_rep: true,
            field_set_key: "grid_item",
            is_own_profile_pins: false,
            redux_normalize_feed: false,
            user_id: userId,
            username,
          },
          map,
          maxPins,
          appVersion,
          signal: opts.signal,
        });
      }
      if (map.size === 0) {
        truncated = await paginatePins({
          resource: "UserPins",
          sourceUrl,
          baseOptions: {
            username,
            field_set_key: "grid_item",
            is_own_profile_pins: false,
            pin_filter: null,
            ...(userId ? { user_id: userId } : {}),
          },
          map,
          maxPins,
          appVersion,
          signal: opts.signal,
        });
      }
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

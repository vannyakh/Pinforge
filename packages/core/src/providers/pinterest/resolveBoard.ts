import type { BoardResolveResult } from "../../types";
import { FETCH_HEADERS, isPinterestHost, normalizePinUrl } from "./resolvePin";

function normalizeBoardUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!isPinterestHost(parsed.hostname)) {
    throw new Error("URL must be a pinterest.com board or search link");
  }

  let path = parsed.pathname.replace(/\/+$/, "");
  if (!path) throw new Error("Invalid board URL");

  // Preserve search query string for /search/pins/?q=
  const search = parsed.search || "";
  return `https://www.pinterest.com${path}/${search}`;
}

function extractPinUrls(html: string): string[] {
  const ids = new Set<string>();

  for (const m of html.matchAll(/\/pin\/(\d+)\//g)) {
    if (m[1]) ids.add(m[1]);
  }
  for (const m of html.matchAll(/\\\/pin\\\/(\d+)\\\//g)) {
    if (m[1]) ids.add(m[1]);
  }

  return [...ids].map((id) => `https://www.pinterest.com/pin/${id}/`);
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

/**
 * Resolve a public board, section, or search page to pin URLs (embedded data / first page).
 */
export async function resolveBoard(url: string): Promise<BoardResolveResult> {
  const boardUrl = normalizeBoardUrl(url);

  const pageRes = await fetch(boardUrl, {
    headers: FETCH_HEADERS,
    redirect: "follow",
  });

  if (!pageRes.ok) {
    throw new Error(`Failed to fetch board page (${pageRes.status}): ${boardUrl}`);
  }

  const html = await pageRes.text();
  const pinUrls = extractPinUrls(html);
  const boardName = extractBoardName(html, boardUrl);

  if (pinUrls.length === 0) {
    throw new Error(
      "No pins found on this page. Make sure the board/search is public."
    );
  }

  return { pinUrls, boardName };
}

export function isBoardUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!isPinterestHost(u.hostname)) return false;
    if (/\/pin\/\d+/.test(u.pathname)) return false;
    // board, section, search
    if (/\/search\//i.test(u.pathname)) return true;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length >= 2;
  } catch {
    return false;
  }
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

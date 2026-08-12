/**
 * Resolve Pinterest multi-pin-share pages (often from pin.it short links).
 * Uses resource/ApiResource → v3_get_multipinshare.
 */

import type { BoardResolveResult, PinListItem } from "@pinforge/types";
import {
  configurePinterestCookies,
  getPinterestCookieHeader,
  pinterestApiHeaders,
  pinterestRequestHeaders,
} from "../shared/session";
import { coverFromPinObject } from "../shared/pinimg";
import { pinUrlFromId } from "../shared/urls";

const MULTI_PIN_SHARE_RE = /\/multi-pin-share\/(\d+)/i;

export function isMultiPinShareUrl(url: string): boolean {
  try {
    return MULTI_PIN_SHARE_RE.test(new URL(url.trim()).pathname);
  } catch {
    return false;
  }
}

export function parseMultiPinShare(url: string): {
  shareId: string;
  inviteCode?: string;
  sourceUrl: string;
} | null {
  try {
    const u = new URL(url.trim());
    const shareId = u.pathname.match(MULTI_PIN_SHARE_RE)?.[1];
    if (!shareId) return null;
    const inviteCode = u.searchParams.get("invite_code") ?? undefined;
    const sourceUrl = `${u.pathname}${u.search}` || `/multi-pin-share/${shareId}/`;
    return { shareId, inviteCode, sourceUrl };
  } catch {
    return null;
  }
}

async function warmPinterestSession(pageUrl: string, signal?: AbortSignal): Promise<void> {
  if (getPinterestCookieHeader()) return;
  const res = await fetch(pageUrl, {
    headers: pinterestRequestHeaders(),
    redirect: "follow",
    signal,
  });
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (setCookies.length === 0) return;
  const cookie = setCookies
    .map((c) => c.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
  if (cookie) configurePinterestCookies(cookie);
}

/**
 * Fetch pin URLs from a multi-pin-share page.
 */
export async function resolveMultiPinShare(
  url: string,
  opts: { maxPins?: number; signal?: AbortSignal } = {}
): Promise<BoardResolveResult> {
  const parsed = parseMultiPinShare(url);
  if (!parsed) throw new Error(`Not a multi-pin-share URL: ${url}`);

  const pageUrl = `https://www.pinterest.com${parsed.sourceUrl}`;
  await warmPinterestSession(pageUrl, opts.signal);

  const maxPins = Math.max(1, Math.min(2000, opts.maxPins ?? 200));
  const data = JSON.stringify({
    options: {
      url: `/v3/multipinshare/${parsed.shareId}/`,
      data: {
        fields: [
          "multipinshare.owner()",
          "multipinshare.pins()",
          "pin.id",
          "pin.grid_title",
          "pin.title",
          "pin.description",
          "pin.images",
          "pin.image_large_url",
          "pin.type",
        ],
      },
    },
    context: {},
  });

  const body = new URLSearchParams({
    source_url: parsed.sourceUrl,
    data,
  });

  const headers = pinterestApiHeaders({
    sourceUrl: parsed.sourceUrl,
    pwsHandler: "www/multi-pin-share/[id].js",
    referer: pageUrl,
  });
  headers["Content-Type"] = "application/x-www-form-urlencoded";

  const res = await fetch("https://www.pinterest.com/resource/ApiResource/get/", {
    method: "POST",
    headers,
    body,
    redirect: "follow",
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch multi-pin share (${res.status})`);
  }

  const json = (await res.json()) as {
    resource_response?: {
      data?: {
        pins?: Array<Record<string, unknown>>;
        owner?: { full_name?: string; username?: string };
      } | null;
      error?: { message?: string };
      message?: string;
    };
  };

  const payload = json.resource_response?.data;
  if (!payload?.pins?.length) {
    const msg =
      json.resource_response?.error?.message ||
      json.resource_response?.message ||
      "No pins found in this shared collection.";
    throw new Error(msg);
  }

  const pins: PinListItem[] = [];
  const pinUrls: string[] = [];
  for (const pin of payload.pins) {
    if (pins.length >= maxPins) break;
    const id = pin.id != null ? String(pin.id) : "";
    if (!/^\d{6,}$/.test(id)) continue;
    const titleRaw = pin.grid_title ?? pin.title ?? pin.description;
    const title =
      typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim().slice(0, 200) : undefined;
    const coverUrl = coverFromPinObject(pin);
    const pinUrl = pinUrlFromId(id);
    pinUrls.push(pinUrl);
    pins.push({ pinId: id, url: pinUrl, title, coverUrl: coverUrl || undefined });
  }

  if (pinUrls.length === 0) {
    throw new Error("No pins found in this shared collection.");
  }

  const ownerName = payload.owner?.full_name || payload.owner?.username || undefined;

  return {
    pinUrls,
    pins,
    boardName: ownerName ? `Shared by ${ownerName}` : "Shared pins",
    kind: "board",
    truncated: payload.pins.length > maxPins,
  };
}

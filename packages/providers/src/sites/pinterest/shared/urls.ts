/**
 * Pinterest URL helpers (pin pages, pin.it shorts, bare ids).
 * Inspired by github.com/motebaya/pinterest-js URL parsing.
 */

import { pinterestRequestHeaders } from "./session";

const PIN_HOST_RE = /^(?:www\.|[\w-]+\.)?pinterest\.(com|co\.\w+|ca|fr|de|jp|kr|com\.\w+)$/i;
const PIN_IT_RE = /^(?:www\.)?pin\.it$/i;
const BARE_PIN_ID_RE = /^\d{6,}$/;

export function isPinterestHost(hostname: string): boolean {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  return PIN_HOST_RE.test(host) || PIN_IT_RE.test(host);
}

export function isPinItHost(hostname: string): boolean {
  return PIN_IT_RE.test(hostname.replace(/\.$/, "").toLowerCase());
}

/** Bare numeric pin id (no scheme/host). */
export function isBarePinId(input: string): boolean {
  return BARE_PIN_ID_RE.test(input.trim());
}

export type ParsedPinInput =
  | { kind: "pin"; pinId: string; url: string }
  | { kind: "short"; code: string; url: string }
  | { kind: "id"; pinId: string; url: string }
  | { kind: "other"; url: string };

/**
 * Parse a pin URL, pin.it short link, or bare pin id.
 * Does not follow network redirects for pin.it (see expandPinterestUrl).
 */
export function parsePinInput(input: string): ParsedPinInput | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (isBarePinId(trimmed)) {
    return {
      kind: "id",
      pinId: trimmed,
      url: `https://www.pinterest.com/pin/${trimmed}/`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!isPinterestHost(parsed.hostname)) return null;

  if (isPinItHost(parsed.hostname)) {
    const code = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
    if (!code) return null;
    return { kind: "short", code, url: `https://pin.it/${code}` };
  }

  const pinMatch = parsed.pathname.match(/\/pin\/(\d+)/);
  if (pinMatch?.[1]) {
    return {
      kind: "pin",
      pinId: pinMatch[1],
      url: `https://www.pinterest.com/pin/${pinMatch[1]}/`,
    };
  }

  return { kind: "other", url: parsed.href };
}

/**
 * Sync normalize. Accepts bare ids and full pin/board URLs.
 * pin.it shorts are returned as `https://pin.it/…` — use expandPinterestUrl to resolve.
 */
export function normalizePinUrl(url: string): string {
  const parsed = parsePinInput(url);
  if (!parsed) throw new Error(`Invalid URL: ${url}`);
  if (parsed.kind === "short") return parsed.url;
  if (parsed.kind === "pin" || parsed.kind === "id") return parsed.url;
  try {
    const u = new URL(parsed.url);
    if (!isPinterestHost(u.hostname) || isPinItHost(u.hostname)) {
      throw new Error("URL must be a pinterest.com pin or board link");
    }
    return u.href;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("URL must")) throw err;
    throw new Error(`Invalid URL: ${url}`);
  }
}

export function pinUrlFromId(pinId: string): string {
  return `https://www.pinterest.com/pin/${pinId}/`;
}

/**
 * Expand pin.it / bare id / regional hosts to a canonical www pin or collection URL.
 */
export async function expandPinterestUrl(url: string): Promise<string> {
  const parsed = parsePinInput(url);
  if (!parsed) throw new Error(`Invalid URL: ${url}`);

  if (parsed.kind === "pin" || parsed.kind === "id") return parsed.url;

  if (parsed.kind === "short") {
    const res = await fetch(parsed.url, {
      method: "GET",
      redirect: "follow",
      headers: pinterestRequestHeaders(),
    });
    const finalUrl = res.url || parsed.url;
    try {
      const u = new URL(finalUrl);
      const pinId = u.pathname.match(/\/pin\/(\d+)/)?.[1];
      if (pinId) return pinUrlFromId(pinId);
      if (isPinterestHost(u.hostname) && !isPinItHost(u.hostname)) {
        return `https://www.pinterest.com${u.pathname}${u.search}`;
      }
    } catch {
      /* fall through */
    }
    throw new Error(`Could not expand pin.it link: ${url}`);
  }

  const u = new URL(parsed.url);
  if (isPinItHost(u.hostname)) {
    throw new Error(`Could not expand pin.it link: ${url}`);
  }
  return parsed.url;
}

export function isPinUrl(url: string): boolean {
  const parsed = parsePinInput(url);
  if (!parsed) return false;
  return parsed.kind === "pin" || parsed.kind === "id" || parsed.kind === "short";
}

export function isPinterestUrl(url: string): boolean {
  try {
    const trimmed = url.trim();
    if (isBarePinId(trimmed)) return true;
    const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    return isPinterestHost(new URL(withScheme).hostname);
  } catch {
    return false;
  }
}

export function extractPinIdFromUrl(url: string): string | undefined {
  try {
    return new URL(url.trim()).pathname.match(/\/pin\/(\d+)/)?.[1];
  } catch {
    return undefined;
  }
}

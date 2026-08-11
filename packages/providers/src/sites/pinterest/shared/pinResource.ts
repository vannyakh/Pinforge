/**
 * Shared PinResource/get client used by single-pin and board hydration.
 */

import { coverFromPinObject } from "./pinimg";
import { getPinterestCookieHeader, pinterestApiHeaders } from "./session";

export type FetchPinResourceOpts = {
  appVersion?: string;
  htmlCookies?: string;
  signal?: AbortSignal;
};

/** Fetch detailed pin JSON from PinResource. Returns null on failure / id mismatch. */
export async function fetchPinResource(
  pinId: string,
  opts: FetchPinResourceOpts = {}
): Promise<Record<string, unknown> | null> {
  const sourceUrl = `/pin/${pinId}/`;
  const data = JSON.stringify({
    options: { id: pinId, field_set_key: "detailed" },
    context: {},
  });
  const url = new URL("https://www.pinterest.com/resource/PinResource/get/");
  url.searchParams.set("source_url", sourceUrl);
  url.searchParams.set("data", data);
  url.searchParams.set("_", String(Date.now()));

  const headers = pinterestApiHeaders({
    sourceUrl,
    pwsHandler: "www/pin/[id].js",
    appVersion: opts.appVersion,
  });
  if (opts.htmlCookies && !getPinterestCookieHeader()) {
    const token = `pinforge${Math.random().toString(36).slice(2, 10)}`;
    headers.Cookie = `${opts.htmlCookies}; csrftoken=${token}`;
    headers["X-CSRFToken"] = token;
  }

  const res = await fetch(url.toString(), {
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
  return pin;
}

/** Title + cover for board/grid hydration. */
export async function fetchPinMeta(
  pinId: string,
  opts: FetchPinResourceOpts = {}
): Promise<{ title?: string; coverUrl?: string } | null> {
  const pin = await fetchPinResource(pinId, opts);
  if (!pin) return null;

  const titleRaw = pin.grid_title ?? pin.title ?? pin.description ?? pin.closeup_description;
  const title =
    typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim().slice(0, 200) : undefined;
  const coverUrl = coverFromPinObject(pin);
  if (!title && !coverUrl) return null;
  return { title, coverUrl };
}

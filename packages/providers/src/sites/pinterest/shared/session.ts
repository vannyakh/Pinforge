/**
 * Optional Pinterest session (browser cookies) for private boards / better feeds.
 */

let cookieHeader: string | null = null;

export const PINTEREST_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

/** Paste a Cookie header value (e.g. from DevTools) or Netscape-style lines. */
export function configurePinterestCookies(raw?: string | null): void {
  const text = (raw ?? "").trim();
  if (!text) {
    cookieHeader = null;
    return;
  }
  // Already a Cookie header (possibly multi-line name=value pairs)
  if (!text.includes("\t") && text.includes("=")) {
    cookieHeader = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .join("; ");
    return;
  }
  // Netscape cookie file lines: domain flag path secure expiry name value
  const parts: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const cols = t.split("\t");
    if (cols.length >= 7) {
      const name = cols[5];
      const value = cols[6];
      if (name && value != null) parts.push(`${name}=${value}`);
    } else if (t.includes("=")) {
      parts.push(t);
    }
  }
  cookieHeader = parts.length ? parts.join("; ") : null;
}

export function getPinterestCookieHeader(): string | null {
  return cookieHeader;
}

export function pinterestRequestHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": PINTEREST_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...extra,
  };
  if (cookieHeader) headers.Cookie = cookieHeader;
  return headers;
}

/** Random hex id for Zipkin B3 request tracing headers (Pinterest resource APIs). */
export function pinterestTraceId(): string {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
    .toString(16)
    .padStart(16, "0");
}

/**
 * Headers for `resource/*Resource/get/` XHR calls.
 * Mirrors patterns used by pinterest-js (B3 trace + PWS handler).
 */
export function pinterestApiHeaders(opts: {
  sourceUrl: string;
  pwsHandler: string;
  appVersion?: string;
  referer?: string;
  extra?: Record<string, string>;
}): Record<string, string> {
  const csrf = pinterestCsrfToken();
  const trace = pinterestTraceId();
  const headers = pinterestRequestHeaders({
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "X-Pinterest-AppState": "active",
    "X-Pinterest-PWS-Handler": opts.pwsHandler,
    "X-Pinterest-Source-Url": opts.sourceUrl,
    "X-B3-TraceId": trace,
    "X-B3-SpanId": pinterestTraceId(),
    "X-B3-ParentSpanId": trace,
    "X-B3-Flags": "0",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    Referer: opts.referer ?? `https://www.pinterest.com${opts.sourceUrl}`,
    ...opts.extra,
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
  return headers;
}

export function pinterestCsrfToken(): string | undefined {
  if (!cookieHeader) return undefined;
  const m = cookieHeader.match(/(?:^|;\s*)csrftoken=([^;]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : undefined;
}

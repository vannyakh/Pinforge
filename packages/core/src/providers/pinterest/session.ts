/**
 * Optional Pinterest session (browser cookies) for private boards / better feeds.
 */

let cookieHeader: string | null = null;

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
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...extra,
  };
  if (cookieHeader) headers.Cookie = cookieHeader;
  return headers;
}

export function pinterestCsrfToken(): string | undefined {
  if (!cookieHeader) return undefined;
  const m = cookieHeader.match(/(?:^|;\s*)csrftoken=([^;]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : undefined;
}

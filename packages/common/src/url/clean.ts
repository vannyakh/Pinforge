/**
 * Unescape common JSON/HTML encodings in scraped media URLs.
 */
export function cleanUrl(raw: string): string {
  return raw
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Deduplicate HTTP(S) URLs after cleanUrl. */
export function uniqHttpUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const c = cleanUrl(u);
    if (!c.startsWith("http") || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** Deduplicate any non-empty strings (already cleaned). */
export function uniqStrings(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** True for http(s) absolute URLs. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

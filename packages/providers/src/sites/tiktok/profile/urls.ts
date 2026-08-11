export function isTikTokProfileUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!/^(www\.)?(tiktok\.com)$/i.test(u.hostname)) return false;
    const path = u.pathname.replace(/\/+$/, "") || "/";
    // Single video: /@user/video/123
    if (/\/@[^/]+\/video\//i.test(path)) return false;
    // Profile: /@user or /@user/…
    if (/^\/@[^/]+$/i.test(path)) return true;
    if (/^\/@[^/]+\/(video)?$/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

export function normalizeTikTokProfileUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const m = u.pathname.match(/^\/(@[^/]+)/i);
    if (m?.[1]) {
      u.pathname = `/${m[1]}`;
      u.search = "";
      u.hash = "";
      return u.toString().replace(/\/+$/, "");
    }
  } catch {
    /* ignore */
  }
  return url.trim().replace(/\/+$/, "");
}

export function extractTikTokUsername(url: string): string | undefined {
  try {
    const m = new URL(url.trim()).pathname.match(/^\/@([^/]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

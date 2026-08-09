/** YouTube watch URL that also carries a playlist / mix (`list=`). */
export function youtubeWatchHasList(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!/^(www\.)?(youtube\.com|m\.youtube\.com|music\.youtube\.com)$/i.test(u.hostname)) {
      return false;
    }
    const list = u.searchParams.get("list");
    if (!list?.trim()) return false;
    if (u.searchParams.has("v")) return true;
    if (/\/shorts\/[\w-]+/i.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Turn a watch?v=…&list=… URL into a /playlist?list=… page URL. */
export function youtubePlaylistPageFromWatch(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const list = u.searchParams.get("list")?.trim();
    if (!list) return null;
    return `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`;
  } catch {
    return null;
  }
}

/** If get-list is on and URL is watch+list, rewrite to playlist page; else keep URL. */
export function resolveYoutubeExtractUrl(url: string, getPlaylistList: boolean): string {
  if (!getPlaylistList || !youtubeWatchHasList(url)) return url;
  return youtubePlaylistPageFromWatch(url) ?? url;
}

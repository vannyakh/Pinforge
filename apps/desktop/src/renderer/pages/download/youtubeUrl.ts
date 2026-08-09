/** Mix / radio / other lists that fail on /playlist?list=… (“unviewable”). */
export function isYouTubeMixPlaylistId(playlistId: string): boolean {
  const id = playlistId.trim();
  if (!id) return false;
  if (/^RD/i.test(id)) return true;
  if (/^MLCT$/i.test(id)) return true;
  if (/^RLTD[\w-]{22}$/i.test(id)) return true;
  return false;
}

export function extractYouTubePlaylistId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const list = u.searchParams.get("list");
    if (list?.trim()) return list.trim();
    const fromPath = u.pathname.match(/\/playlist\/([^/?#]+)/i);
    return fromPath?.[1] ?? null;
  } catch {
    return null;
  }
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{6,}$/.test(v)) return v;
    const shorts = u.pathname.match(/\/shorts\/([\w-]+)/i)?.[1];
    if (shorts) return shorts;
    const embed = u.pathname.match(/\/embed\/([\w-]+)/i)?.[1];
    if (embed) return embed;
    if (/^(youtu\.be)$/i.test(u.hostname.replace(/^www\./, ""))) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^[\w-]{6,}$/.test(id)) return id;
    }
    return null;
  } catch {
    return null;
  }
}

/** Best-effort seed video for Mix ids (e.g. RD + 11-char video id). */
export function seedVideoIdFromMixPlaylistId(playlistId: string): string | null {
  const id = playlistId.trim();
  const rdVideo = id.match(/^RD([\w-]{11})$/i);
  if (rdVideo) return rdVideo[1];
  const rdAmvm = id.match(/^RDAMVM([\w-]{11})$/i);
  if (rdAmvm) return rdAmvm[1];
  if (/^RD/i.test(id) && id.length > 13) {
    const tail = id.slice(-11);
    if (/^[\w-]{11}$/.test(tail)) return tail;
  }
  return null;
}

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

/**
 * If get-list is on and URL is watch+list:
 * - Normal playlists → /playlist?list=…
 * - Mix / radio (RD…) stay on watch?v=…&list=… (playlist page is unviewable)
 */
export function resolveYoutubeExtractUrl(url: string, getPlaylistList: boolean): string {
  if (!getPlaylistList || !youtubeWatchHasList(url)) return url;
  const listId = extractYouTubePlaylistId(url);
  if (listId && isYouTubeMixPlaylistId(listId)) {
    const hasVideo = Boolean(extractYouTubeVideoId(url));
    if (hasVideo) return url.trim();
    const seed = seedVideoIdFromMixPlaylistId(listId);
    if (seed) {
      return `https://www.youtube.com/watch?v=${encodeURIComponent(seed)}&list=${encodeURIComponent(listId)}`;
    }
    return url.trim();
  }
  return youtubePlaylistPageFromWatch(url) ?? url;
}

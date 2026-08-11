/** Mix / radio / other lists that fail on /playlist?list=… (“unviewable”). */
export function isYouTubeMixPlaylistId(playlistId: string): boolean {
  const id = playlistId.trim();
  if (!id) return false;
  // RD* = Mix / radio; MLCT / RLTD* = known unviewable prefixes (yt-dlp).
  if (/^RD/i.test(id)) return true;
  if (/^MLCT$/i.test(id)) return true;
  if (/^RLTD[\w-]{22}$/i.test(id)) return true;
  return false;
}

/** Pure playlist URL (not a watch URL with optional &list=). */
export function isYouTubePlaylistUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!/^(www\.)?(youtube\.com|m\.youtube\.com|music\.youtube\.com)$/i.test(u.hostname)) {
      return false;
    }
    // Watch / shorts with a video id stay single even if list= is present.
    if (u.searchParams.has("v")) return false;
    if (/\/(shorts|embed|live)\b/i.test(u.pathname)) return false;
    if (/\/playlist\/?/i.test(u.pathname)) return true;
    if (u.searchParams.has("list")) return true;
    return false;
  } catch {
    return false;
  }
}

export function extractYouTubePlaylistId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const list = u.searchParams.get("list");
    if (list && list.trim()) return list.trim();
    const fromPath = u.pathname.match(/\/playlist\/([^/?#]+)/i);
    if (fromPath?.[1]) return fromPath[1];
    return null;
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

/**
 * Best-effort seed video for Mix ids (e.g. RD + 11-char video id).
 * Returns null when the seed cannot be inferred from the playlist id alone.
 */
export function seedVideoIdFromMixPlaylistId(playlistId: string): string | null {
  const id = playlistId.trim();
  // Classic Mix: RD + videoId
  const rdVideo = id.match(/^RD([\w-]{11})$/i);
  if (rdVideo) return rdVideo[1];
  // YouTube Music automix: RDAMVM + videoId
  const rdAmvm = id.match(/^RDAMVM([\w-]{11})$/i);
  if (rdAmvm) return rdAmvm[1];
  // Topic / longer RD* ids — last 11 chars are often the seed
  if (/^RD/i.test(id) && id.length > 13) {
    const tail = id.slice(-11);
    if (/^[\w-]{11}$/.test(tail)) return tail;
  }
  return null;
}

export function isUnviewablePlaylistError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /unviewable|playlist type/i.test(msg);
}

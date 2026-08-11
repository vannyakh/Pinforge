/**
 * YouTube playlist listing via Innertube.
 * Regular playlists use browse (`getPlaylist`); Mix / radio (`RD…`) use the
 * watch-next playlist panel because `/playlist?list=RD…` is unviewable.
 */
import { resolveYouTubeBrowsePlaylist } from "./browse";
import { resolveYouTubeMixPlaylist, type YoutubePlaylistResolveResult } from "./mix";
import {
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  isUnviewablePlaylistError,
  isYouTubeMixPlaylistId,
} from "./urls";

export type { YoutubePlaylistVideo } from "./parseNode";
export type { YoutubePlaylistResolveResult } from "./mix";
export {
  isYouTubeMixPlaylistId,
  isYouTubePlaylistUrl,
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  seedVideoIdFromMixPlaylistId,
} from "./urls";

const DEFAULT_MAX = 50;

/**
 * List videos from a YouTube playlist / mix URL.
 * Caps at `maxVideos` (default 50) and sets `truncated` when more exist.
 *
 * Mix / radio (`RD…`) require a seed video (`v=` in the URL, or inferred from the list id).
 */
export async function resolveYouTubePlaylist(
  url: string,
  opts: { maxVideos?: number; signal?: AbortSignal } = {}
): Promise<YoutubePlaylistResolveResult> {
  const maxVideos = Math.max(1, Math.min(500, opts.maxVideos ?? DEFAULT_MAX));
  opts.signal?.throwIfAborted?.();

  const playlistId = extractYouTubePlaylistId(url);
  if (!playlistId) {
    throw new Error(
      "Could not find a playlist id in this URL. Use a /playlist?list=… or watch?v=…&list=… link."
    );
  }

  const seedVideoId = extractYouTubeVideoId(url);

  if (isYouTubeMixPlaylistId(playlistId)) {
    return resolveYouTubeMixPlaylist(playlistId, {
      maxVideos,
      seedVideoId,
      signal: opts.signal,
    });
  }

  try {
    return await resolveYouTubeBrowsePlaylist(playlistId, {
      maxVideos,
      signal: opts.signal,
    });
  } catch (err) {
    if (isUnviewablePlaylistError(err) || seedVideoId) {
      return resolveYouTubeMixPlaylist(playlistId, {
        maxVideos,
        seedVideoId,
        signal: opts.signal,
      });
    }
    throw err;
  }
}

import { pickVideoId, playlistTitleOf, toPlaylistVideo, type YoutubePlaylistVideo } from "./parseNode";
import { seedVideoIdFromMixPlaylistId } from "./urls";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyYt = any;

let innertubeMod: AnyYt | null = null;

async function getInnertube() {
  if (!innertubeMod) {
    innertubeMod = await import("youtubei.js");
  }
  return innertubeMod as typeof import("youtubei.js");
}

export interface YoutubePlaylistResolveResult {
  playlistId: string;
  playlistTitle?: string;
  videos: YoutubePlaylistVideo[];
  truncated?: boolean;
}

/**
 * Mix / radio lists only work from watch?v=…&list=RD… (inline playlist panel).
 */
export async function resolveYouTubeMixPlaylist(
  playlistId: string,
  opts: { maxVideos: number; seedVideoId?: string | null; signal?: AbortSignal }
): Promise<YoutubePlaylistResolveResult> {
  const seed = opts.seedVideoId || seedVideoIdFromMixPlaylistId(playlistId);
  if (!seed) {
    throw new Error(
      "This Mix / radio playlist needs a video id. Open a watch URL with &list=… (not /playlist?list=… alone)."
    );
  }

  opts.signal?.throwIfAborted?.();
  const { Innertube, ClientType, UniversalCache, YTNodes } = await getInnertube();
  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    client_type: ClientType.WEB,
  });

  const NavigationEndpoint = YTNodes.NavigationEndpoint;
  const seen = new Set<string>();
  const videos: YoutubePlaylistVideo[] = [];
  let playlistTitle: string | undefined;
  let cursor = seed;
  let pages = 0;
  let isInfinite = true;

  while (videos.length < opts.maxVideos && pages < 40) {
    opts.signal?.throwIfAborted?.();
    const endpoint = new NavigationEndpoint({
      watchEndpoint: { videoId: cursor, playlistId },
    });
    const info = await yt.getInfo(endpoint);
    const panel = info.playlist;
    if (!panel?.contents?.length) {
      if (videos.length === 0) {
        // Fallback: Music “Up Next” automix from the seed video
        try {
          const panelMusic = await yt.music.getUpNext(seed, true);
          playlistTitle = playlistTitleOf(panelMusic) ?? playlistTitle;
          for (const node of panelMusic.contents ?? []) {
            const item = toPlaylistVideo(node);
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            videos.push(item);
            if (videos.length >= opts.maxVideos) break;
          }
        } catch {
          /* ignore — throw below if still empty */
        }
      }
      break;
    }

    if (!playlistTitle) {
      playlistTitle =
        typeof panel.title === "string" ? panel.title : playlistTitleOf({ title: panel.title });
    }
    isInfinite = Boolean(panel.is_infinite);

    let added = 0;
    for (const node of panel.contents) {
      const item = toPlaylistVideo(node);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      videos.push(item);
      added += 1;
      if (videos.length >= opts.maxVideos) break;
    }

    pages += 1;
    const lastId = pickVideoId(panel.contents[panel.contents.length - 1]);
    if (!lastId || lastId === cursor || added === 0) break;
    if (!isInfinite && videos.length >= (panel.contents?.length ?? 0)) break;
    cursor = lastId;
  }

  if (videos.length === 0) {
    throw new Error(
      "Could not load videos from this Mix / radio playlist. Try the full watch URL with &list=…"
    );
  }

  return {
    playlistId,
    playlistTitle: playlistTitle || `Mix`,
    videos,
    truncated: isInfinite || videos.length >= opts.maxVideos,
  };
}

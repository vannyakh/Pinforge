import { playlistTitleOf, toPlaylistVideo, type YoutubePlaylistVideo } from "./parseNode";
import type { YoutubePlaylistResolveResult } from "./mix";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyYt = any;

let innertubeMod: AnyYt | null = null;

async function getInnertube() {
  if (!innertubeMod) {
    innertubeMod = await import("youtubei.js");
  }
  return innertubeMod as typeof import("youtubei.js");
}

export async function resolveYouTubeBrowsePlaylist(
  playlistId: string,
  opts: { maxVideos: number; signal?: AbortSignal }
): Promise<YoutubePlaylistResolveResult> {
  const { Innertube, ClientType, UniversalCache } = await getInnertube();
  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    client_type: ClientType.WEB,
  });

  opts.signal?.throwIfAborted?.();
  let page: AnyYt = await yt.getPlaylist(playlistId);
  const playlistTitle = playlistTitleOf(page);

  const seen = new Set<string>();
  const videos: YoutubePlaylistVideo[] = [];

  const consume = (nodes: AnyYt[]) => {
    for (const node of nodes) {
      const item = toPlaylistVideo(node);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      videos.push(item);
      if (videos.length >= opts.maxVideos) return;
    }
  };

  consume([...(page.items ?? page.videos ?? [])]);

  let pages = 0;
  while (page.has_continuation && videos.length < opts.maxVideos && pages < 30) {
    opts.signal?.throwIfAborted?.();
    page = await page.getContinuation();
    consume([...(page.items ?? page.videos ?? [])]);
    pages += 1;
  }

  return {
    playlistId,
    playlistTitle,
    videos,
    truncated: Boolean(page.has_continuation) || videos.length >= opts.maxVideos,
  };
}

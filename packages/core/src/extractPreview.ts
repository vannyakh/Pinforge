import type { DownloadMode, FormatPreset, ProviderId } from "./types";
import { detectProvider, ProviderNotFoundError } from "./providers";
import {
  isBoardUrl,
  isPinterestCollectionUrl,
  isProfileUrl,
  resolveBoard,
  isYouTubeChannelUrl,
  resolveYouTubeChannel,
  isYouTubePlaylistUrl,
  extractYouTubePlaylistId,
  resolveYouTubePlaylist,
  isTikTokProfileUrl,
  resolveTikTokProfile,
} from "./providers";
import { DEFAULT_YOUTUBE_OPTIONS } from "./types";

export interface ExtractPreviewItem {
  index: number;
  url: string;
  title?: string;
  /** Remote cover / thumbnail for UI previews when scraped or derived. */
  coverUrl?: string;
  /** Listing duration label (e.g. 12:34). */
  durationText?: string;
  durationSec?: number;
}

export interface ExtractPreview {
  sourceUrl: string;
  title?: string;
  provider: {
    id: ProviderId | string;
    label: string;
    live: boolean;
  };
  /** Detected download shape for this URL. */
  mode: DownloadMode;
  /** Whether the provider can actually process this mode today. */
  modeSupported: boolean;
  formats: FormatPreset[];
  /** Modes the provider advertises support for. */
  supportedModes: DownloadMode[];
  items: ExtractPreviewItem[];
  itemCount: number;
  truncated?: boolean;
  message?: string;
}

function pathOf(url: string): string {
  try {
    return new URL(url.trim()).pathname;
  } catch {
    return "";
  }
}

function classifyMode(providerId: string, url: string): DownloadMode {
  const path = pathOf(url);

  if (providerId === "pinterest") {
    if (isProfileUrl(url)) return "profile";
    if (isBoardUrl(url) || isPinterestCollectionUrl(url)) return "board";
    return "single";
  }

  if (providerId === "youtube") {
    try {
      const u = new URL(url.trim());
      if (/\/playlist\/?/i.test(u.pathname)) return "playlist";
      if (!u.searchParams.has("v") && u.searchParams.has("list")) return "playlist";
      // Single Short stays single; channel /shorts tab is profile
      if (/\/shorts\/[\w-]+/i.test(u.pathname)) return "single";
      if (
        /^\/(channel|c|user)\/[^/]+/i.test(u.pathname) ||
        /^\/@[^/]+/i.test(u.pathname)
      ) {
        return "profile";
      }
    } catch {
      /* ignore */
    }
    return "single";
  }

  if (providerId === "instagram") {
    if (/\/stories\//i.test(path)) return "story";
    if (/\/(p|reel|tv)\//i.test(path)) return "single";
    if (path.split("/").filter(Boolean).length >= 1) return "profile";
    return "single";
  }

  if (providerId === "tiktok") {
    if (/\/video\//i.test(path) || /\/@[^/]+\/video\//i.test(path)) return "single";
    if (/\/@[^/]+\/?$/i.test(path)) return "profile";
    return "single";
  }

  return "single";
}

function shortTitleFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url.trim());
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1]?.replace(/[-_]+/g, " ") || undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort cover for known hosts (YouTube watch / shorts / youtu.be). */
export function coverUrlFromMediaUrl(url: string): string | undefined {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://i.ytimg.com/vi/${v}/hqdefault.jpg`;
      const shorts = u.pathname.match(/\/shorts\/([\w-]+)/i)?.[1];
      if (shorts) return `https://i.ytimg.com/vi/${shorts}/hqdefault.jpg`;
      const embed = u.pathname.match(/\/embed\/([\w-]+)/i)?.[1];
      if (embed) return `https://i.ytimg.com/vi/${embed}/hqdefault.jpg`;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export interface ExtractPreviewOptions {
  /** Cap channel / profile listing (YouTube). Defaults to `DEFAULT_YOUTUBE_OPTIONS.channelMaxVideos`. */
  channelMaxVideos?: number;
  /** Cap playlist listing (YouTube). Defaults to `DEFAULT_YOUTUBE_OPTIONS.playlistMaxVideos`. */
  playlistMaxVideos?: number;
  /** Cap Pinterest board / profile / search pins. Defaults to 200. */
  boardMaxPins?: number;
  /**
   * Treat watch?v=…&list=… as a playlist extract (UI “Get playlist”).
   * Required for Mix / radio lists that must stay on the watch URL.
   */
  preferPlaylist?: boolean;
}

/**
 * Detect provider, classify mode, and list extractable items for bulk/board URLs.
 * Single-item URLs return a one-row list. Unsupported bulk modes return an empty list
 * with `modeSupported: false` so the UI can show a capability table.
 */
export async function extractMediaPreview(
  url: string,
  opts: ExtractPreviewOptions = {}
): Promise<ExtractPreview> {
  const sourceUrl = url.trim();
  if (!sourceUrl) {
    throw new Error("URL is required");
  }

  let provider;
  try {
    provider = detectProvider(sourceUrl);
  } catch (err) {
    if (err instanceof ProviderNotFoundError) {
      return {
        sourceUrl,
        provider: { id: "unknown", label: "Unknown", live: false },
        mode: "single",
        modeSupported: false,
        formats: [],
        supportedModes: [],
        items: [],
        itemCount: 0,
        message: "No provider matches this URL.",
      };
    }
    throw err;
  }

  const mode = classifyMode(provider.id, sourceUrl);
  const supportedModes = (provider.modes ?? ["single"]) as DownloadMode[];
  const modeSupported = provider.live && supportedModes.includes(mode);
  const formats = (provider.formats ?? ["best"]) as FormatPreset[];

  const base: Omit<ExtractPreview, "items" | "itemCount" | "title" | "truncated" | "message"> = {
    sourceUrl,
    provider: {
      id: provider.id,
      label: provider.label,
      live: provider.live,
    },
    mode,
    modeSupported,
    formats,
    supportedModes,
  };

  if (!provider.live) {
    return {
      ...base,
      items: [],
      itemCount: 0,
      message: `${provider.label} is not live yet.`,
    };
  }

  // Pinterest board / profile / search → pin list with covers when available
  if (
    provider.id === "pinterest" &&
    (mode === "board" || mode === "profile" || isPinterestCollectionUrl(sourceUrl))
  ) {
    try {
      const board = await resolveBoard(sourceUrl, {
        maxPins: opts.boardMaxPins ?? opts.channelMaxVideos ?? 200,
      });
      const list =
        board.pins && board.pins.length > 0
          ? board.pins
          : board.pinUrls.map((pinUrl) => {
              const pinId = pinUrl.match(/\/pin\/(\d+)/)?.[1] ?? "";
              return { pinId, url: pinUrl, title: undefined as string | undefined, coverUrl: undefined as string | undefined };
            });
      const items: ExtractPreviewItem[] = list.map((p, index) => ({
        index: index + 1,
        url: p.url,
        title: p.title || (p.pinId ? `Pin ${p.pinId}` : `Pin ${index + 1}`),
        coverUrl: p.coverUrl,
      }));
      const more = board.truncated ? " (truncated — raise Max and Get list)" : "";
      const kindLabel =
        board.kind === "profile"
          ? "profile"
          : board.kind === "search"
            ? "search"
            : board.kind === "section"
              ? "section"
              : "board";
      return {
        ...base,
        mode: board.kind === "profile" ? "profile" : "board",
        modeSupported: true,
        title: board.boardName,
        items,
        itemCount: items.length,
        truncated: board.truncated,
        message: `Found ${items.length} pin${items.length === 1 ? "" : "s"} on this ${kindLabel}${more}.`,
      };
    } catch (err) {
      return {
        ...base,
        modeSupported: true,
        items: [],
        itemCount: 0,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // YouTube channel / @handle / profile → uploads (or /shorts /streams tab)
  if (provider.id === "youtube" && (mode === "profile" || isYouTubeChannelUrl(sourceUrl))) {
    try {
      const channel = await resolveYouTubeChannel(sourceUrl, {
        maxVideos:
          opts.channelMaxVideos ?? DEFAULT_YOUTUBE_OPTIONS.channelMaxVideos,
      });
      const items: ExtractPreviewItem[] = channel.videos.map((v, index) => ({
        index: index + 1,
        url: v.url,
        title: v.title,
        coverUrl: v.coverUrl || coverUrlFromMediaUrl(v.url),
        durationText: v.durationText,
        durationSec: v.durationSec,
      }));
      const more = channel.truncated ? " (truncated)" : "";
      const kind =
        channel.tab === "shorts"
          ? "short"
          : channel.tab === "streams"
            ? "stream"
            : "video";
      const kindPlural =
        channel.tab === "shorts"
          ? "shorts"
          : channel.tab === "streams"
            ? "streams"
            : "videos";
      const label = channel.channelTitle ?? "channel";
      return {
        ...base,
        mode: "profile",
        modeSupported: true,
        title: channel.channelTitle,
        items,
        itemCount: items.length,
        truncated: channel.truncated,
        message:
          items.length === 0
            ? `No ${kindPlural} found on ${label}.`
            : `Found ${items.length} ${
                items.length === 1 ? kind : kindPlural
              } on ${label}${more}.`,
      };
    } catch (err) {
      return {
        ...base,
        mode: "profile",
        modeSupported: true,
        items: [],
        itemCount: 0,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // TikTok @profile → video list
  if (provider.id === "tiktok" && (mode === "profile" || isTikTokProfileUrl(sourceUrl))) {
    try {
      const profile = await resolveTikTokProfile(sourceUrl, {
        maxVideos: opts.channelMaxVideos ?? DEFAULT_YOUTUBE_OPTIONS.channelMaxVideos,
      });
      const items: ExtractPreviewItem[] = profile.videos.map((v, index) => ({
        index: index + 1,
        url: v.url,
        title: v.title || `Video ${v.id}`,
        coverUrl: v.coverUrl,
        durationText: v.durationText,
        durationSec: v.durationSec,
      }));
      const more = profile.truncated ? " (truncated — raise Max and Get list)" : "";
      const label = profile.displayName || `@${profile.username}`;
      return {
        ...base,
        mode: "profile",
        modeSupported: true,
        title: label,
        items,
        itemCount: items.length,
        truncated: profile.truncated,
        message:
          items.length === 0
            ? `No videos found on ${label}.`
            : `Found ${items.length} video${items.length === 1 ? "" : "s"} on ${label}${more}.`,
      };
    } catch (err) {
      return {
        ...base,
        mode: "profile",
        modeSupported: true,
        items: [],
        itemCount: 0,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // YouTube playlist / mix → video list (same pick-download UX as profile)
  const listId = provider.id === "youtube" ? extractYouTubePlaylistId(sourceUrl) : null;
  const preferWatchPlaylist = Boolean(opts.preferPlaylist) && Boolean(listId);
  const isPlaylistExtract =
    mode === "playlist" ||
    isYouTubePlaylistUrl(sourceUrl) ||
    preferWatchPlaylist;

  if (provider.id === "youtube" && isPlaylistExtract) {
    try {
      const playlist = await resolveYouTubePlaylist(sourceUrl, {
        maxVideos:
          opts.playlistMaxVideos ?? DEFAULT_YOUTUBE_OPTIONS.playlistMaxVideos,
      });
      const items: ExtractPreviewItem[] = playlist.videos.map((v, index) => ({
        index: index + 1,
        url: v.url,
        title: v.title,
        coverUrl: v.coverUrl || coverUrlFromMediaUrl(v.url),
        durationText: v.durationText,
        durationSec: v.durationSec,
      }));
      const more = playlist.truncated ? " (truncated)" : "";
      return {
        ...base,
        mode: "playlist",
        modeSupported: true,
        title: playlist.playlistTitle,
        items,
        itemCount: items.length,
        truncated: playlist.truncated,
        message:
          items.length === 0
            ? `No videos found in ${playlist.playlistTitle ?? "this playlist"}.`
            : `Found ${items.length} video${items.length === 1 ? "" : "s"} in ${
                playlist.playlistTitle ?? "playlist"
              }${more}.`,
      };
    } catch (err) {
      return {
        ...base,
        mode: "playlist",
        modeSupported: true,
        items: [],
        itemCount: 0,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (!modeSupported && mode !== "single") {
    return {
      ...base,
      items: [],
      itemCount: 0,
      message: `${provider.label} ${mode} extract is not supported yet. Supported: ${supportedModes.join(", ")}.`,
    };
  }

  // Single YouTube — real Innertube preview (title / channel / duration / qualities)
  if (provider.id === "youtube" && mode === "single") {
    try {
      const { previewYouTubeVideo } = await import("./providers/youtube/service");
      const preview = await previewYouTubeVideo(sourceUrl);
      const qualityHint =
        preview.qualities.length > 0
          ? ` · up to ${preview.qualities[0]}p`
          : "";
      return {
        ...base,
        mode: "single",
        modeSupported: true,
        title: preview.title,
        items: [
          {
            index: 1,
            url: sourceUrl,
            title: preview.title,
            coverUrl: preview.thumbnailUrl || coverUrlFromMediaUrl(sourceUrl),
            durationText: preview.durationText,
            durationSec: preview.durationSec,
          },
        ],
        itemCount: 1,
        message: `${preview.channel ? `${preview.channel} · ` : ""}${preview.title}${qualityHint}`,
      };
    } catch {
      /* fall through to generic single */
    }
  }

  // Single media — one-item extract list
  return {
    ...base,
    mode: "single",
    modeSupported: true,
    title: shortTitleFromUrl(sourceUrl),
    items: [
      {
        index: 1,
        url: sourceUrl,
        title: shortTitleFromUrl(sourceUrl),
        coverUrl: coverUrlFromMediaUrl(sourceUrl),
      },
    ],
    itemCount: 1,
    message: `Ready to download 1 item from ${provider.label}.`,
  };
}

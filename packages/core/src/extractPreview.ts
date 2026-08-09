import type { DownloadMode, FormatPreset, ProviderId } from "./types";
import { detectProvider, ProviderNotFoundError } from "./providers";
import { isBoardUrl, resolveBoard, isYouTubeChannelUrl, resolveYouTubeChannel, isYouTubePlaylistUrl, resolveYouTubePlaylist } from "./providers";
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
    return isBoardUrl(url) ? "board" : "single";
  }

  if (providerId === "youtube") {
    try {
      const u = new URL(url.trim());
      if (/\/playlist\/?/i.test(u.pathname)) return "playlist";
      if (!u.searchParams.has("v") && u.searchParams.has("list")) return "playlist";
      if (/^\/(channel|c|user)\//i.test(u.pathname) || /^\/@/.test(u.pathname)) {
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

  // Pinterest board / search → real extract list
  if (provider.id === "pinterest" && mode === "board") {
    try {
      const board = await resolveBoard(sourceUrl);
      const items: ExtractPreviewItem[] = board.pinUrls.map((pinUrl, index) => ({
        index: index + 1,
        url: pinUrl,
        title: `Pin ${index + 1}`,
      }));
      return {
        ...base,
        modeSupported: true,
        title: board.boardName,
        items,
        itemCount: items.length,
        message: `Found ${items.length} pin${items.length === 1 ? "" : "s"} on this board.`,
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

  // YouTube channel / @handle / profile → uploads list
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
            ? `No videos found on ${channel.channelTitle ?? "this channel"}.`
            : `Found ${items.length} video${items.length === 1 ? "" : "s"} on ${
                channel.channelTitle ?? "channel"
              }${more}.`,
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
  if (provider.id === "youtube" && (mode === "playlist" || isYouTubePlaylistUrl(sourceUrl))) {
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

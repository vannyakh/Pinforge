import type { DownloadMode, FormatPreset, ProviderId } from "./types";
import { detectProvider, ProviderNotFoundError } from "./providers";
import { isBoardUrl, resolveBoard } from "./providers";

export interface ExtractPreviewItem {
  index: number;
  url: string;
  title?: string;
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

/**
 * Detect provider, classify mode, and list extractable items for bulk/board URLs.
 * Single-item URLs return a one-row list. Unsupported bulk modes return an empty list
 * with `modeSupported: false` so the UI can show a capability table.
 */
export async function extractMediaPreview(url: string): Promise<ExtractPreview> {
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
    items: [{ index: 1, url: sourceUrl, title: shortTitleFromUrl(sourceUrl) }],
    itemCount: 1,
    message: `Ready to download 1 item from ${provider.label}.`,
  };
}

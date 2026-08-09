/** Provider engines, manifests, and format plugins (extension-style). */

export type ProviderEngineId =
  | "builtin"
  | "http-meta"
  | "piped"
  | "script"
  | "playwright";

export interface ProviderEngineInfo {
  id: ProviderEngineId;
  label: string;
  description: string;
}

export const PROVIDER_ENGINES: ProviderEngineInfo[] = [
  {
    id: "builtin",
    label: "Built-in",
    description: "Use Pinforge’s built-in extractor for this site.",
  },
  {
    id: "http-meta",
    label: "HTTP + meta",
    description: "Fetch the page and read Open Graph / media tags.",
  },
  {
    id: "piped",
    label: "Piped API",
    description: "YouTube-compatible Piped (or similar) API base URL.",
  },
  {
    id: "playwright",
    label: "Browser scrape",
    description: "Render the page in Chromium when meta tags are missing.",
  },
  {
    id: "script",
    label: "Script package",
    description: "Run the uploaded extension’s main entry from the manifest.",
  },
];

/** pinforge.provider.json (or manifest.json) inside an uploaded package */
export interface ProviderManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  logo?: string;
  engine?: ProviderEngineId;
  hosts?: string[];
  formats?: string[];
  /** Entry file relative to package root (for engine=script) */
  main?: string;
  author?: string;
  homepage?: string;
  formatPlugins?: Array<{ id: string; name: string; entry?: string }>;
  config?: Record<string, unknown>;
}

export interface FormatPluginConfig {
  id: string;
  label: string;
  enabled: boolean;
  /** Absolute path to plugin file or package */
  sourcePath: string;
  /** Optional entry from manifest */
  entry?: string;
  version?: string;
  createdAt: number;
}

export interface CustomProviderConfig {
  id: string;
  label: string;
  enabled: boolean;
  /** Host patterns, e.g. youtube.com, youtu.be */
  hosts: string;
  /** Local uploaded extension / package root */
  sourcePath?: string;
  /** Path to manifest file inside the package */
  manifestPath?: string;
  /** Parsed manifest snapshot */
  manifest?: ProviderManifest;
  /** Registry / remote package URL */
  sourceUrl?: string;
  notes?: string;
  /** Download engine for this provider */
  engine?: ProviderEngineId;
  /** Optional Piped / extractor base URL (YouTube / piped engine) */
  extractorUrl?: string;
  /** Default format preference for this provider */
  format?: string;
  /** Format plugins attached to this provider */
  formatPlugins?: FormatPluginConfig[];
  /** true when this overrides a built-in provider */
  builtin?: boolean;
  version?: string;
  createdAt: number;
}

/** Catalog entries shown in “Browse registry” (install = save config for now). */
export interface ProviderRegistryItem {
  id: string;
  label: string;
  description: string;
  hosts: string;
  status: "official" | "community";
  engine?: ProviderEngineId;
}

export const PROVIDER_REGISTRY: ProviderRegistryItem[] = [
  {
    id: "facebook",
    label: "Facebook",
    description: "Posts and watch videos from facebook.com / fb.watch",
    hosts: "facebook.com, fb.watch, fb.com",
    status: "official",
    engine: "http-meta",
  },
  {
    id: "douyin",
    label: "Douyin",
    description: "Short videos from douyin.com",
    hosts: "douyin.com",
    status: "official",
    engine: "playwright",
  },
  {
    id: "spotify",
    label: "Spotify",
    description: "Tracks and episodes from open.spotify.com",
    hosts: "spotify.com, open.spotify.com",
    status: "official",
    engine: "http-meta",
  },
  {
    id: "apple-music",
    label: "Apple Music",
    description: "Songs and albums from music.apple.com",
    hosts: "music.apple.com",
    status: "official",
    engine: "http-meta",
  },
  {
    id: "capcut",
    label: "CapCut",
    description: "Templates and media from capcut.com",
    hosts: "capcut.com",
    status: "community",
    engine: "http-meta",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    description: "Posts from bsky.app",
    hosts: "bsky.app, bsky.social",
    status: "community",
    engine: "http-meta",
  },
  {
    id: "rednote",
    label: "RedNote / Xiaohongshu",
    description: "Notes and media from xiaohongshu.com",
    hosts: "xiaohongshu.com, xhslink.com",
    status: "community",
    engine: "playwright",
  },
  {
    id: "threads",
    label: "Threads",
    description: "Posts from threads.net",
    hosts: "threads.net",
    status: "community",
    engine: "http-meta",
  },
  {
    id: "kuaishou",
    label: "Kuaishou",
    description: "Videos from kuaishou.com",
    hosts: "kuaishou.com",
    status: "community",
    engine: "playwright",
  },
  {
    id: "weibo",
    label: "Weibo",
    description: "Posts and video from weibo.com",
    hosts: "weibo.com",
    status: "community",
    engine: "http-meta",
  },
];

/** Built-in live providers — defaults for detail / config UI. */
export const BUILTIN_PROVIDER_META: Record<
  string,
  {
    description: string;
    hosts: string;
    formats?: string[];
    engine: ProviderEngineId;
  }
> = {
  youtube: {
    description: "Videos, Shorts, and music links from YouTube.",
    hosts: "youtube.com, youtu.be, m.youtube.com, music.youtube.com",
    formats: ["best", "mp4", "audio-only"],
    engine: "piped",
  },
  instagram: {
    description: "Posts, reels, and stories media from Instagram.",
    hosts: "instagram.com, instagr.am",
    formats: ["best", "mp4"],
    engine: "http-meta",
  },
  tiktok: {
    description: "Videos from TikTok share links.",
    hosts: "tiktok.com, vm.tiktok.com, vt.tiktok.com",
    formats: ["best", "mp4"],
    engine: "http-meta",
  },
  pinterest: {
    description: "Pins and boards — images and videos.",
    hosts: "pinterest.com, pin.it",
    formats: ["best"],
    engine: "builtin",
  },
};

export const MANIFEST_FILENAMES = ["pinforge.provider.json", "manifest.json"] as const;

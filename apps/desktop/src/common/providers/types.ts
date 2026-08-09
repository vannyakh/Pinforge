/** Provider engines, manifests, and format plugins (extension-style). */

export type ProviderEngineId =
  | "builtin"
  | "http-meta"
  | "piped"
  | "script"
  | "playwright";

export type ProviderCapability =
  | "video.download"
  | "audio.download"
  | "image.download"
  | "playlist.download"
  | "profile.download"
  | "metadata.fetch"
  | "batch.download"
  | "login.required";

export type ProviderOrigin = "builtin-override" | "registry" | "local";

export type ProviderLifecycle =
  | "installed"
  | "enabled"
  | "disabled"
  | "updateAvailable"
  | "incompatible";

export type ProviderCategory =
  | "video"
  | "social"
  | "music"
  | "images"
  | "streaming"
  | "utilities";

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

export const CAPABILITY_LABELS: Record<ProviderCapability, string> = {
  "video.download": "Video",
  "audio.download": "Audio",
  "image.download": "Images",
  "playlist.download": "Playlist",
  "profile.download": "Profile",
  "metadata.fetch": "Metadata",
  "batch.download": "Batch",
  "login.required": "Login",
};

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
  capabilities?: ProviderCapability[];
  /** SHA-256 hex of package payload (optional; verified on install when set) */
  checksum?: string;
  minAppVersion?: string;
  category?: ProviderCategory;
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
  origin?: ProviderOrigin;
  capabilities?: ProviderCapability[];
  checksum?: string;
  installedVersion?: string;
  version?: string;
  createdAt: number;
  updatedAt?: number;
}

/** Persisted enable/disable for shipped built-ins (cannot be uninstalled). */
export interface ProviderPrefs {
  disabledBuiltinIds: string[];
}

export const DEFAULT_PROVIDER_PREFS: ProviderPrefs = {
  disabledBuiltinIds: [],
};

/** Catalog entries shown in Registry browser. */
export interface ProviderRegistryItem {
  id: string;
  label: string;
  description: string;
  hosts: string;
  status: "official" | "community";
  engine?: ProviderEngineId;
  version: string;
  capabilities: ProviderCapability[];
  category?: ProviderCategory;
  verified?: boolean;
  checksum?: string;
  /** Reserved for remote package fetch */
  packageUrl?: string;
}

export interface RegistryListItem extends ProviderRegistryItem {
  installed: boolean;
  installedVersion?: string;
  updateAvailable: boolean;
}

export interface InstalledProviderView {
  id: string;
  label: string;
  hosts: string;
  origin: ProviderOrigin | "builtin";
  lifecycle: ProviderLifecycle;
  enabled: boolean;
  version?: string;
  capabilities: ProviderCapability[];
  checksum?: string;
  builtin: boolean;
  live: boolean;
  sourcePath?: string;
  updateAvailable?: boolean;
}

const VIDEO_CAPS: ProviderCapability[] = [
  "video.download",
  "metadata.fetch",
  "batch.download",
];
const SOCIAL_CAPS: ProviderCapability[] = [
  "video.download",
  "image.download",
  "metadata.fetch",
];
const MUSIC_CAPS: ProviderCapability[] = [
  "audio.download",
  "metadata.fetch",
  "playlist.download",
];

export const PROVIDER_REGISTRY: ProviderRegistryItem[] = [
  {
    id: "facebook",
    label: "Facebook",
    description: "Posts and watch videos from facebook.com / fb.watch",
    hosts: "facebook.com, fb.watch, fb.com",
    status: "official",
    engine: "http-meta",
    version: "0.1.0",
    capabilities: [...VIDEO_CAPS, "image.download"],
    category: "social",
    verified: true,
  },
  {
    id: "douyin",
    label: "Douyin",
    description: "Short videos from douyin.com",
    hosts: "douyin.com",
    status: "official",
    engine: "playwright",
    version: "0.1.0",
    capabilities: [...VIDEO_CAPS],
    category: "video",
    verified: true,
  },
  {
    id: "spotify",
    label: "Spotify",
    description: "Tracks and episodes from open.spotify.com",
    hosts: "spotify.com, open.spotify.com",
    status: "official",
    engine: "http-meta",
    version: "0.1.0",
    capabilities: [...MUSIC_CAPS],
    category: "music",
    verified: true,
  },
  {
    id: "apple-music",
    label: "Apple Music",
    description: "Songs and albums from music.apple.com",
    hosts: "music.apple.com",
    status: "official",
    engine: "http-meta",
    version: "0.1.0",
    capabilities: [...MUSIC_CAPS],
    category: "music",
    verified: true,
  },
  {
    id: "capcut",
    label: "CapCut",
    description: "Templates and media from capcut.com",
    hosts: "capcut.com",
    status: "community",
    engine: "http-meta",
    version: "0.1.0",
    capabilities: ["video.download", "metadata.fetch"],
    category: "video",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    description: "Posts from bsky.app",
    hosts: "bsky.app, bsky.social",
    status: "community",
    engine: "http-meta",
    version: "0.1.0",
    capabilities: [...SOCIAL_CAPS],
    category: "social",
  },
  {
    id: "rednote",
    label: "RedNote / Xiaohongshu",
    description: "Notes and media from xiaohongshu.com",
    hosts: "xiaohongshu.com, xhslink.com",
    status: "community",
    engine: "playwright",
    version: "0.1.0",
    capabilities: [...SOCIAL_CAPS, "login.required"],
    category: "social",
  },
  {
    id: "threads",
    label: "Threads",
    description: "Posts from threads.net",
    hosts: "threads.net",
    status: "community",
    engine: "http-meta",
    version: "0.1.0",
    capabilities: [...SOCIAL_CAPS],
    category: "social",
  },
  {
    id: "kuaishou",
    label: "Kuaishou",
    description: "Videos from kuaishou.com",
    hosts: "kuaishou.com",
    status: "community",
    engine: "playwright",
    version: "0.1.0",
    capabilities: [...VIDEO_CAPS],
    category: "video",
  },
  {
    id: "weibo",
    label: "Weibo",
    description: "Posts and video from weibo.com",
    hosts: "weibo.com",
    status: "community",
    engine: "http-meta",
    version: "0.1.0",
    capabilities: [...SOCIAL_CAPS],
    category: "social",
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
    capabilities: ProviderCapability[];
    category?: ProviderCategory;
    version: string;
  }
> = {
  youtube: {
    description: "Videos, Shorts, and music links from YouTube.",
    hosts: "youtube.com, youtu.be, m.youtube.com, music.youtube.com",
    formats: ["best", "mp4", "audio-only"],
    engine: "piped",
    capabilities: [
      "video.download",
      "audio.download",
      "playlist.download",
      "profile.download",
      "metadata.fetch",
      "batch.download",
    ],
    category: "video",
    version: "1.0.0",
  },
  instagram: {
    description: "Posts, reels, and stories media from Instagram.",
    hosts: "instagram.com, instagr.am",
    formats: ["best", "mp4"],
    engine: "http-meta",
    capabilities: [
      "video.download",
      "image.download",
      "profile.download",
      "metadata.fetch",
      "batch.download",
    ],
    category: "social",
    version: "1.0.0",
  },
  tiktok: {
    description: "Videos from TikTok share links.",
    hosts: "tiktok.com, vm.tiktok.com, vt.tiktok.com",
    formats: ["best", "mp4"],
    engine: "http-meta",
    capabilities: ["video.download", "metadata.fetch", "batch.download"],
    category: "video",
    version: "1.0.0",
  },
  pinterest: {
    description: "Pins and boards — images and videos.",
    hosts: "pinterest.com, pin.it",
    formats: ["best"],
    engine: "builtin",
    capabilities: [
      "image.download",
      "video.download",
      "playlist.download",
      "profile.download",
      "metadata.fetch",
      "batch.download",
    ],
    category: "images",
    version: "1.0.0",
  },
};

export const MANIFEST_FILENAMES = ["pinforge.provider.json", "manifest.json"] as const;

/** Compare dotted versions; returns >0 if a>b, <0 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function hostListMatches(hostsCsv: string, url: string): boolean {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const parts = hostsCsv
    .split(/[,;\s]+/)
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return parts.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`) || hostname.includes(h)
  );
}

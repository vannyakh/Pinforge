import Store from "electron-store";
import { app } from "electron";
import { join } from "node:path";
import type {
  FormatPreset,
  PresetName,
  ProviderId,
  MediaKind,
  EnhanceFeatures,
  YoutubeDownloadOptions,
  PinterestOptions,
  NamingTemplates,
} from "@pinforge/core/types";
import {
  DEFAULT_ENHANCE_FEATURES,
  DEFAULT_YOUTUBE_OPTIONS,
  DEFAULT_PINTEREST_OPTIONS,
  DEFAULT_NAMING_TEMPLATES,
} from "@pinforge/core/types";
import {
  DEFAULT_REMOTE,
  DEFAULT_TUNNEL,
  type RemoteConfig,
  type RemoteChannelConfig,
  type CloudflareTunnelConfig,
} from "../common/remote/types";
import type { CustomProviderConfig, ProviderPrefs } from "../common/providers/types";
import { DEFAULT_PROVIDER_PREFS } from "../common/providers/types";
import {
  DEFAULT_META_PUBLISH,
  DEFAULT_YOUTUBE_PUBLISH,
  type PublishConfig,
  type MetaPublishConfig,
  type YouTubePublishConfig,
} from "../common/publish/types";

export type { RemoteConfig, RemoteChannelConfig, CloudflareTunnelConfig };
export type { CustomProviderConfig, ProviderPrefs };
export type { PublishConfig, MetaPublishConfig, YouTubePublishConfig };
export type PackStatus = "running" | "done" | "failed" | "partial";

/** Renderer Tasks queue row persisted across restarts. */
export interface PendingQueueJob {
  id: string;
  url: string;
  addedAt: number;
  opts: {
    enhance: boolean;
    format: FormatPreset;
    preset: PresetName;
    outDir: string;
    youtube: {
      quality?: YoutubeDownloadOptions["quality"];
      audioContainer?: YoutubeDownloadOptions["audioContainer"];
      subtitles?: YoutubeDownloadOptions["subtitles"];
    };
  };
}

export interface HistoryItem {
  id: string;
  url: string;
  outPath: string;
  originalPath?: string;
  title?: string;
  preset: PresetName;
  provider?: ProviderId;
  kind?: MediaKind;
  packId?: string;
  createdAt: number;
  /** Actual stream height (px) when known. */
  height?: number;
  format?: FormatPreset;
  youtubeQuality?: YoutubeDownloadOptions["quality"];
}

/** One download job grouped by source URL (board/pin/video pack). */
export interface DownloadPack {
  id: string;
  url: string;
  title?: string;
  provider?: ProviderId;
  status: PackStatus;
  preset: PresetName;
  itemIds: string[];
  errorCount: number;
  /** MediaCore job id — used to resume paused/interrupted downloads. */
  jobId?: string;
  /** Max stream height (px) across saved items when known. */
  height?: number;
  format?: FormatPreset;
  youtubeQuality?: YoutubeDownloadOptions["quality"];
  createdAt: number;
  updatedAt: number;
}

export interface SystemConfig {
  language: string;
  startOnBoot: boolean;
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  notifications: boolean;
  notifyOnDownloadComplete: boolean;
  /** Empty = OS temp + /Pinforge */
  tempDir: string;
  /** Empty = userData/logs */
  logDir: string;
  /** Absolute path to ffmpeg binary (optional). */
  ffmpegPath: string;
  /** When true and available, YouTube mux/convert/tag tools use ffmpeg. */
  ffmpegEnabled: boolean;
  /** Absolute path to yt-dlp binary (optional). */
  ytdlpPath: string;
  /** When true and available, catch-all yt-dlp provider can download. */
  ytdlpEnabled: boolean;
  /** First-run CapCut-style environment setup completed (or skipped). */
  environmentSetupDone: boolean;
}

export const DEFAULT_SYSTEM: SystemConfig = {
  language: "en",
  startOnBoot: false,
  closeToTray: false,
  hardwareAcceleration: true,
  notifications: true,
  notifyOnDownloadComplete: true,
  tempDir: "",
  logDir: "",
  ffmpegPath: "",
  ffmpegEnabled: false,
  ytdlpPath: "",
  ytdlpEnabled: false,
  environmentSetupDone: false,
};

export interface AppStoreSchema {
  outDir: string;
  preset: PresetName;
  delayMs: number;
  enhance: boolean;
  enhanceFeatures: EnhanceFeatures;
  /** Skip confirm and start the task after URL detection. */
  autoDownload: boolean;
  /** Give downloads that produce several files their own folder. */
  packFolders: boolean;
  /** Custom file and folder name templates. */
  naming: NamingTemplates;
  /** Watch clipboard for media URLs and queue them (JDownloader-style link grabber). */
  clipboardMonitor: boolean;
  /** When clipboard monitor is on, also grab links while the app is in the background. */
  clipboardMonitorBackground: boolean;
  /** Max pack-level downloads running at once (1–3). */
  maxParallelDownloads: number;
  /** Pending download URLs waiting for Start in Tasks. */
  pendingQueue: PendingQueueJob[];
  format: FormatPreset;
  youtube: YoutubeDownloadOptions;
  pinterest: PinterestOptions;
  extractorUrl: string;
  history: HistoryItem[];
  packs: DownloadPack[];
  remote: RemoteConfig;
  publish: PublishConfig;
  system: SystemConfig;
  customProviders: CustomProviderConfig[];
  providerPrefs: ProviderPrefs;
  windowBounds?: { x: number; y: number; width: number; height: number };
}

let store: Store<AppStoreSchema> | null = null;

export function getStore(): Store<AppStoreSchema> {
  if (!store) {
    store = new Store<AppStoreSchema>({
      name: "settings",
      defaults: {
        outDir: join(app.getPath("pictures"), "Pinforge Downloads"),
        preset: "auto",
        delayMs: 1500,
        enhance: true,
        enhanceFeatures: { ...DEFAULT_ENHANCE_FEATURES },
        autoDownload: true,
        packFolders: true,
        naming: { ...DEFAULT_NAMING_TEMPLATES },
        clipboardMonitor: false,
        clipboardMonitorBackground: false,
        maxParallelDownloads: 2,
        pendingQueue: [],
        format: "best",
        youtube: { ...DEFAULT_YOUTUBE_OPTIONS },
        pinterest: { ...DEFAULT_PINTEREST_OPTIONS },
        extractorUrl: "",
        history: [],
        packs: [],
        remote: DEFAULT_REMOTE,
        publish: {
          meta: { ...DEFAULT_META_PUBLISH },
          youtube: { ...DEFAULT_YOUTUBE_PUBLISH },
          captionTitleSuggestions: [],
          hashtagSuggestions: [],
        },
        system: DEFAULT_SYSTEM,
        customProviders: [],
        providerPrefs: { ...DEFAULT_PROVIDER_PREFS },
      },
    });
    migrateFlatHistoryToPacks(store);
    ensureRemoteDefaults(store);
    ensurePublishDefaults(store);
    ensureSystemDefaults(store);
    ensureEnhanceFeatures(store);
    ensureYoutubeOptions(store);
    ensurePinterestOptions(store);
    ensureNamingOptions(store);
    if (store.get("clipboardMonitor") === undefined) store.set("clipboardMonitor", false);
    if (store.get("clipboardMonitorBackground") === undefined) {
      store.set("clipboardMonitorBackground", false);
    }
    const parallel = store.get("maxParallelDownloads");
    if (typeof parallel !== "number" || parallel < 1 || parallel > 3) {
      store.set("maxParallelDownloads", 2);
    }
    if (!Array.isArray(store.get("pendingQueue"))) store.set("pendingQueue", []);
    if (!Array.isArray(store.get("customProviders"))) {
      store.set("customProviders", []);
    }
    ensureProviderPrefs(store);
  }
  return store;
}

function ensureEnhanceFeatures(s: Store<AppStoreSchema>): void {
  const cur = s.get("enhanceFeatures");
  s.set("enhanceFeatures", { ...DEFAULT_ENHANCE_FEATURES, ...cur });
}

function ensureYoutubeOptions(s: Store<AppStoreSchema>): void {
  const cur = s.get("youtube");
  s.set("youtube", { ...DEFAULT_YOUTUBE_OPTIONS, ...cur });
}

function ensurePinterestOptions(s: Store<AppStoreSchema>): void {
  const cur = s.get("pinterest");
  s.set("pinterest", { ...DEFAULT_PINTEREST_OPTIONS, ...cur });
}

function ensureNamingOptions(s: Store<AppStoreSchema>): void {
  const cur = s.get("naming");
  s.set("naming", { ...DEFAULT_NAMING_TEMPLATES, ...cur });
}

function ensureProviderPrefs(s: Store<AppStoreSchema>): void {
  const cur = s.get("providerPrefs");
  const disabled = Array.isArray(cur?.disabledBuiltinIds)
    ? cur.disabledBuiltinIds.filter((id): id is string => typeof id === "string")
    : [];
  s.set("providerPrefs", { disabledBuiltinIds: disabled });
}

export function resolveSystemPaths(system: SystemConfig): SystemConfig {
  return {
    ...system,
    tempDir: system.tempDir || join(app.getPath("temp"), "Pinforge"),
    logDir: system.logDir || join(app.getPath("userData"), "logs"),
  };
}

function ensureSystemDefaults(s: Store<AppStoreSchema>): void {
  const system = s.get("system");
  if (!system) {
    s.set("system", DEFAULT_SYSTEM);
    return;
  }
  s.set("system", { ...DEFAULT_SYSTEM, ...system });
}

function ensurePublishDefaults(s: Store<AppStoreSchema>): void {
  const publish = s.get("publish");
  const meta = { ...DEFAULT_META_PUBLISH, ...(publish?.meta ?? {}) };
  const youtube = { ...DEFAULT_YOUTUBE_PUBLISH, ...(publish?.youtube ?? {}) };
  const captionTitleSuggestions = Array.isArray(publish?.captionTitleSuggestions)
    ? publish.captionTitleSuggestions.filter((t): t is string => typeof t === "string")
    : [];
  const hashtagSuggestions = Array.isArray(publish?.hashtagSuggestions)
    ? publish.hashtagSuggestions.filter((t): t is string => typeof t === "string")
    : [];
  s.set("publish", { meta, youtube, captionTitleSuggestions, hashtagSuggestions });
}

function ensureRemoteDefaults(s: Store<AppStoreSchema>): void {
  const remote = s.get("remote");
  if (!remote?.channels?.length) {
    s.set("remote", DEFAULT_REMOTE);
    return;
  }
  const allowedIds = new Set<string>(DEFAULT_REMOTE.channels.map((c) => c.id));
  const saved = new Map(
    remote.channels.filter((c) => allowedIds.has(String(c.id))).map((c) => [c.id, c])
  );
  s.set("remote", {
    channels: DEFAULT_REMOTE.channels.map((def) => {
      const c = saved.get(def.id) ?? def;
      return c.id === "telegram"
        ? {
            ...c,
            requireApproval: c.requireApproval ?? true,
            botOptions: {
              downloadMode: "immediate" as const,
              notifyOnComplete: true,
              maxUrlsPerMessage: 3,
              detectBeforeDownload: true,
              confirmBeforeDownload: true,
              allowQualitySelect: true,
              adminChatId: "",
              ...c.botOptions,
            },
          }
        : c;
    }),
    tunnel: { ...DEFAULT_TUNNEL, ...remote.tunnel },
    users: (remote.users ?? []).filter((u) => allowedIds.has(String(u.channel))),
  });
}

/** One-time: group legacy flat history rows into packs by URL. */
function migrateFlatHistoryToPacks(s: Store<AppStoreSchema>): void {
  const packs = s.get("packs") ?? [];
  const history = s.get("history") ?? [];
  if (packs.length > 0 || history.length === 0) return;

  const byUrl = new Map<string, HistoryItem[]>();
  for (const item of history) {
    const list = byUrl.get(item.url) ?? [];
    list.push(item);
    byUrl.set(item.url, list);
  }

  const nextPacks: DownloadPack[] = [];
  const nextHistory: HistoryItem[] = [];

  for (const [url, items] of byUrl) {
    const packId = `pack-${items[0]!.createdAt}-${Math.random().toString(36).slice(2, 7)}`;
    const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
    nextPacks.push({
      id: packId,
      url,
      title: sorted[0]?.title,
      provider: sorted[0]?.provider,
      status: "done",
      preset: sorted[0]?.preset ?? "auto",
      itemIds: sorted.map((i) => i.id),
      errorCount: 0,
      createdAt: Math.min(...sorted.map((i) => i.createdAt)),
      updatedAt: Math.max(...sorted.map((i) => i.createdAt)),
    });
    for (const item of sorted) {
      nextHistory.push({ ...item, packId });
    }
  }

  s.set("packs", nextPacks.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50));
  s.set("history", nextHistory.slice(0, 200));
}

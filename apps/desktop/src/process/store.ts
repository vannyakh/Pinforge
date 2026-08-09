import Store from "electron-store";
import { app } from "electron";
import { join } from "node:path";
import type { FormatPreset, PresetName, ProviderId, MediaKind } from "@pinterest-desktop/core";
import {
  DEFAULT_REMOTE,
  DEFAULT_TUNNEL,
  type RemoteConfig,
  type RemoteChannelConfig,
  type CloudflareTunnelConfig,
} from "../common/remote/types";
import type { CustomProviderConfig } from "../common/providers/types";

export type { RemoteConfig, RemoteChannelConfig, CloudflareTunnelConfig };
export type { CustomProviderConfig };
export type PackStatus = "running" | "done" | "failed" | "partial";

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
};

export interface AppStoreSchema {
  outDir: string;
  preset: PresetName;
  delayMs: number;
  enhance: boolean;
  format: FormatPreset;
  extractorUrl: string;
  history: HistoryItem[];
  packs: DownloadPack[];
  remote: RemoteConfig;
  system: SystemConfig;
  customProviders: CustomProviderConfig[];
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
        format: "best",
        extractorUrl: "",
        history: [],
        packs: [],
        remote: DEFAULT_REMOTE,
        system: DEFAULT_SYSTEM,
        customProviders: [],
      },
    });
    migrateFlatHistoryToPacks(store);
    ensureRemoteDefaults(store);
    ensureSystemDefaults(store);
    if (!Array.isArray(store.get("customProviders"))) {
      store.set("customProviders", []);
    }
  }
  return store;
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

function ensureRemoteDefaults(s: Store<AppStoreSchema>): void {
  const remote = s.get("remote");
  if (!remote?.channels?.length) {
    s.set("remote", DEFAULT_REMOTE);
    return;
  }
  // Merge any newly added built-in channels
  const byId = new Map(remote.channels.map((c) => [c.id, c]));
  for (const def of DEFAULT_REMOTE.channels) {
    if (!byId.has(def.id)) byId.set(def.id, def);
  }
  s.set("remote", {
    channels: Array.from(byId.values()),
    tunnel: { ...DEFAULT_TUNNEL, ...remote.tunnel },
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

  s.set(
    "packs",
    nextPacks.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50)
  );
  s.set("history", nextHistory.slice(0, 200));
}

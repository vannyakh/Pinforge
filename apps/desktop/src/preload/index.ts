import { contextBridge, ipcRenderer } from "electron";
import type { AutoUpdateStatus, UpdateCheckRequest } from "../common/update/types";

export type { AutoUpdateStatus, UpdateCheckRequest };

export type JobStatus =
  | "queued"
  | "analyzing"
  | "downloading"
  | "paused"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
}

export interface DownloadJob {
  id: string;
  url: string;
  status: JobStatus;
  provider?: string;
  progress: JobProgress;
  files: { temp?: string; final?: string; jobDir?: string };
  outputDir?: string;
  title?: string;
  error?: string;
  packId?: string;
  createdAt: number;
  updatedAt: number;
}

export type PresetName = "auto" | "soft" | "crisp" | "upscale";
export type FormatPreset = "best" | "mp4" | "audio-only";

export type YoutubeQuality = "best" | "4320" | "2160" | "1440" | "1080" | "720" | "480" | "360";
export type AudioContainer = "m4a" | "mp3" | "flac";
export type SubtitleMode = "none" | "separate" | "embed";

export interface YoutubeDownloadOptions {
  quality?: YoutubeQuality;
  audioContainer?: AudioContainer;
  subtitles?: SubtitleMode;
  subtitleLang?: string;
  organizeByChannel?: boolean;
  tagMetadata?: boolean;
  resume?: boolean;
  /** Max videos from a channel / profile URL (default 50). */
  channelMaxVideos?: number;
  /** Max videos from a playlist / mix URL (default 50). */
  playlistMaxVideos?: number;
  /** Save merged video file (default true). */
  saveVideo?: boolean;
  /** Also save a separate audio track (default true). */
  saveAudio?: boolean;
  /** Save thumbnail as a sidecar image (default true). */
  saveThumbnail?: boolean;
}

export interface PinterestOptions {
  cookies?: string;
  boardMaxPins?: number;
  zipBoards?: boolean;
}

export interface NamingTemplates {
  fileName?: string;
  folderName?: string;
}

export interface EnhanceFeatures {
  autoLevels: boolean;
  denoise: boolean;
  sharpen: boolean;
  upscale: boolean;
  keepOriginal: boolean;
}
export type ProviderId = string;
export type MediaKind = "image" | "video" | "audio";
export type PackStatus = "running" | "done" | "failed" | "partial";

export interface ProcessResult {
  outPath: string;
  sourceUrl: string;
  originalPath?: string;
  title?: string;
  provider?: ProviderId;
  kind?: MediaKind;
}

export interface ProcessResponse {
  kind: "pin" | "board";
  provider?: ProviderId;
  packId?: string;
  pack?: DownloadPack;
  jobId?: string;
  results: ProcessResult[];
  errors: { url: string; error: string }[];
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
  height?: number;
  format?: FormatPreset;
  youtubeQuality?: YoutubeQuality;
}

export interface DownloadPack {
  id: string;
  url: string;
  title?: string;
  provider?: ProviderId;
  status: PackStatus;
  preset: PresetName;
  itemIds: string[];
  errorCount: number;
  jobId?: string;
  height?: number;
  format?: FormatPreset;
  youtubeQuality?: YoutubeQuality;
  createdAt: number;
  updatedAt: number;
}

export interface MediaProgressEvent {
  packId: string;
  url: string;
  current: number;
  total: number;
  status: PackStatus;
  title?: string;
  message?: string;
  percent?: number;
  downloaded?: number;
  totalBytes?: number | null;
  phase?: string;
  etaSec?: number | null;
  speedBps?: number | null;
}

export interface PendingQueueJob {
  id: string;
  url: string;
  addedAt: number;
  opts: {
    enhance: boolean;
    format: FormatPreset;
    preset: PresetName;
    outDir: string;
    youtube: Partial<YoutubeDownloadOptions>;
  };
}

export interface ProviderInfo {
  id: string;
  label: string;
  status: "live" | "stub";
  formats?: FormatPreset[];
  modes?: Array<"single" | "board" | "profile" | "playlist" | "story">;
}

export interface DetectedProvider {
  id: string;
  label: string;
  live: boolean;
  formats: FormatPreset[];
  modes?: Array<"single" | "board" | "profile" | "playlist" | "story">;
  disabled?: boolean;
  message?: string;
}

export type DownloadMode = "single" | "board" | "profile" | "playlist" | "story";

export interface ExtractPreviewItem {
  index: number;
  url: string;
  title?: string;
  /** Remote cover / thumbnail for UI previews when scraped or derived. */
  coverUrl?: string;
  durationText?: string;
  durationSec?: number;
}

export interface ExtractPreview {
  sourceUrl: string;
  title?: string;
  provider: {
    id: string;
    label: string;
    live: boolean;
  };
  mode: DownloadMode;
  modeSupported: boolean;
  formats: FormatPreset[];
  supportedModes: DownloadMode[];
  items: ExtractPreviewItem[];
  itemCount: number;
  truncated?: boolean;
  message?: string;
  /** Available video heights (px), highest first — YouTube single preview. */
  qualities?: number[];
}

export interface SystemConfig {
  language: string;
  startOnBoot: boolean;
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  notifications: boolean;
  notifyOnDownloadComplete: boolean;
  tempDir: string;
  logDir: string;
  ffmpegPath: string;
  ffmpegEnabled: boolean;
  ytdlpPath: string;
  ytdlpEnabled: boolean;
  /** First-run CapCut-style environment setup completed (or skipped). */
  environmentSetupDone: boolean;
}

export interface FormatPluginConfig {
  id: string;
  label: string;
  enabled: boolean;
  sourcePath: string;
  entry?: string;
  version?: string;
  createdAt: number;
}

export interface ProviderManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  logo?: string;
  engine?: string;
  hosts?: string[];
  formats?: string[];
  capabilities?: string[];
  checksum?: string;
  minAppVersion?: string;
  category?: string;
  main?: string;
  author?: string;
  homepage?: string;
  formatPlugins?: Array<{ id: string; name: string; entry?: string }>;
  config?: Record<string, unknown>;
}

export interface CustomProviderConfig {
  id: string;
  label: string;
  enabled: boolean;
  hosts: string;
  sourcePath?: string;
  manifestPath?: string;
  manifest?: ProviderManifest;
  sourceUrl?: string;
  notes?: string;
  engine?: string;
  extractorUrl?: string;
  format?: string;
  formatPlugins?: FormatPluginConfig[];
  builtin?: boolean;
  origin?: "builtin-override" | "registry" | "local";
  capabilities?: string[];
  checksum?: string;
  installedVersion?: string;
  version?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface ProviderPrefs {
  disabledBuiltinIds: string[];
}

export interface RegistryListItem {
  id: string;
  label: string;
  description: string;
  hosts: string;
  status: "official" | "community";
  engine?: string;
  version: string;
  capabilities: string[];
  category?: string;
  verified?: boolean;
  checksum?: string;
  packageUrl?: string;
  installed: boolean;
  installedVersion?: string;
  updateAvailable: boolean;
}

export interface InstalledProviderView {
  id: string;
  label: string;
  hosts: string;
  origin: "builtin" | "builtin-override" | "registry" | "local";
  lifecycle: "installed" | "enabled" | "disabled" | "updateAvailable" | "incompatible";
  enabled: boolean;
  version?: string;
  capabilities: string[];
  checksum?: string;
  builtin: boolean;
  live: boolean;
  sourcePath?: string;
  updateAvailable?: boolean;
}

export interface AppSettings {
  outDir: string;
  preset: PresetName;
  delayMs: number;
  enhance: boolean;
  enhanceFeatures: EnhanceFeatures;
  autoDownload: boolean;
  packFolders: boolean;
  naming: NamingTemplates;
  clipboardMonitor: boolean;
  clipboardMonitorBackground: boolean;
  maxParallelDownloads: number;
  pendingQueue: PendingQueueJob[];
  format: FormatPreset;
  youtube: YoutubeDownloadOptions;
  pinterest: PinterestOptions;
  extractorUrl: string;
  history: HistoryItem[];
  packs: DownloadPack[];
  remote: RemoteConfig;
  system: SystemConfig;
  presets: Record<
    PresetName,
    {
      label: string;
      description: string;
      denoise: number;
      sharpen: number;
      upscale: number;
      autoLevels: boolean;
    }
  >;
  providers: ProviderInfo[];
  customProviders: CustomProviderConfig[];
  providerPrefs?: ProviderPrefs;
}

export type RemoteChannelId = string;

export type RemoteBotDownloadMode = "immediate" | "queue";

export interface RemoteBotOptions {
  welcomeMessage?: string;
  downloadMode?: RemoteBotDownloadMode;
  notifyOnComplete?: boolean;
  maxUrlsPerMessage?: number;
  detectBeforeDownload?: boolean;
  confirmBeforeDownload?: boolean;
  allowQualitySelect?: boolean;
  adminChatId?: string;
}

export interface RemoteChannelConfig {
  id: RemoteChannelId;
  label: string;
  enabled: boolean;
  available: boolean;
  botToken?: string;
  webhookUrl?: string;
  sendFilesBack: boolean;
  requireApproval?: boolean;
  botOptions?: RemoteBotOptions;
  notes?: string;
}

export type RemoteUserStatus = "pending" | "approved" | "denied";

export interface RemoteUser {
  id: string;
  channel: RemoteChannelId | string;
  externalId: string;
  username?: string;
  displayName?: string;
  status: RemoteUserStatus;
  requestedAt: number;
  decidedAt?: number;
}

export interface CloudflareTunnelConfig {
  enabled: boolean;
  token: string;
  hostname: string;
  localPort: number;
  allowFileSendBack: boolean;
  binaryPath: string;
  status: "stopped" | "starting" | "running" | "error";
  lastError?: string;
  publicUrl?: string;
}

export interface RemoteConfig {
  channels: RemoteChannelConfig[];
  tunnel: CloudflareTunnelConfig;
  users: RemoteUser[];
}

export type RemoteRuntimeStatus = {
  api: { running: boolean; port: number; url: string | null; error?: string };
  telegram: { running: boolean; username?: string; error?: string };
  tunnel: { running: boolean; publicUrl?: string; error?: string };
};

export type SettingsPartial = Partial<{
  outDir: string;
  preset: PresetName;
  delayMs: number;
  enhance: boolean;
  enhanceFeatures: Partial<EnhanceFeatures>;
  autoDownload: boolean;
  packFolders: boolean;
  naming: Partial<NamingTemplates>;
  clipboardMonitor: boolean;
  clipboardMonitorBackground: boolean;
  maxParallelDownloads: number;
  pendingQueue: PendingQueueJob[];
  format: FormatPreset;
  youtube: Partial<YoutubeDownloadOptions>;
  pinterest: Partial<PinterestOptions>;
  extractorUrl: string;
  system: Partial<SystemConfig>;
}>;

export interface DownloadTask {
  packId: string;
  url: string;
  current: number;
  total: number;
  status: PackStatus;
  title?: string;
  message?: string;
  updatedAt: number;
  percent?: number;
  downloaded?: number;
  totalBytes?: number | null;
  phase?: string;
  etaSec?: number | null;
  speedBps?: number | null;
}

export interface DiskSpaceInfo {
  path: string;
  free: number;
  total: number;
}

export interface SystemResourcesInfo {
  cpuPercent: number;
  cpuCount: number;
  memory: {
    used: number;
    free: number;
    total: number;
  };
}

const api = {
  /** Signal main that CSS + React have mounted — used to show the window. */
  rendererReady: (): void => {
    ipcRenderer.send("renderer:ready");
  },

  getAppInfo: (): Promise<{ version: string; isPackaged: boolean }> =>
    ipcRenderer.invoke("app:getInfo"),

  processMedia: (payload: {
    url: string;
    preset: PresetName;
    outDir: string;
    enhance?: boolean;
    format?: FormatPreset;
    features?: Partial<EnhanceFeatures>;
    youtube?: Partial<YoutubeDownloadOptions>;
    pinterest?: Partial<PinterestOptions>;
    packFolders?: boolean;
    naming?: Partial<NamingTemplates>;
  }): Promise<ProcessResponse> => ipcRenderer.invoke("media:process", payload),
  resumeMedia: (jobId: string): Promise<ProcessResponse> =>
    ipcRenderer.invoke("media:resume", { jobId }),
  cancelMedia: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke("media:cancel"),
  processPin: (url: string, preset: PresetName, outDir: string): Promise<ProcessResponse> =>
    ipcRenderer.invoke("pin:process", { url, preset, outDir }),
  detectProvider: (url: string): Promise<DetectedProvider | null> =>
    ipcRenderer.invoke("media:detect", url),
  extractPreview: (
    url: string,
    opts?: {
      channelMaxVideos?: number;
      playlistMaxVideos?: number;
      boardMaxPins?: number;
      preferPlaylist?: boolean;
    }
  ): Promise<ExtractPreview> => ipcRenderer.invoke("media:extract", url, opts),
  listProviders: (): Promise<ProviderInfo[]> => ipcRenderer.invoke("media:providers"),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("pin:pickFolder"),
  pickFolderPath: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pickFolder", defaultPath),
  pickProviderSource: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickProviderSource"),
  pickFormatPlugin: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickFormatPlugin"),
  listCustomProviders: (): Promise<CustomProviderConfig[]> =>
    ipcRenderer.invoke("providers:listCustom"),
  listInstalledProviders: (): Promise<InstalledProviderView[]> =>
    ipcRenderer.invoke("providers:listInstalled"),
  registryList: (): Promise<RegistryListItem[]> => ipcRenderer.invoke("providers:registryList"),
  setProviderEnabled: (
    id: string,
    enabled: boolean
  ): Promise<{
    providers: CustomProviderConfig[];
    providerPrefs: ProviderPrefs;
    installed: InstalledProviderView[];
  }> => ipcRenderer.invoke("providers:setEnabled", { id, enabled }),
  installFromRegistry: (
    id: string
  ): Promise<{
    provider: CustomProviderConfig;
    providers: CustomProviderConfig[];
    registry: RegistryListItem[];
  }> => ipcRenderer.invoke("providers:installFromRegistry", id),
  uninstallProvider: (
    id: string
  ): Promise<{
    providers: CustomProviderConfig[];
    registry: RegistryListItem[];
    installed: InstalledProviderView[];
  }> => ipcRenderer.invoke("providers:uninstall", id),
  upsertCustomProvider: (provider: CustomProviderConfig): Promise<CustomProviderConfig[]> =>
    ipcRenderer.invoke("providers:upsertCustom", provider),
  removeCustomProvider: (id: string): Promise<CustomProviderConfig[]> =>
    ipcRenderer.invoke("providers:removeCustom", id),
  installProviderFromSource: (
    sourcePath: string
  ): Promise<{ provider: CustomProviderConfig; providers: CustomProviderConfig[] }> =>
    ipcRenderer.invoke("providers:installFromSource", sourcePath),
  readProviderManifest: (
    pathOrDir: string
  ): Promise<{ path: string; manifest: ProviderManifest } | null> =>
    ipcRenderer.invoke("providers:readManifest", pathOrDir),
  uploadFormatPlugin: (sourcePath: string): Promise<FormatPluginConfig> =>
    ipcRenderer.invoke("providers:uploadFormatPlugin", sourcePath),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  setSettings: (
    partial: SettingsPartial
  ): Promise<
    Pick<
      AppSettings,
      | "outDir"
      | "preset"
      | "delayMs"
      | "enhance"
      | "enhanceFeatures"
      | "autoDownload"
      | "packFolders"
      | "naming"
      | "clipboardMonitor"
      | "clipboardMonitorBackground"
      | "maxParallelDownloads"
      | "pendingQueue"
      | "format"
      | "youtube"
      | "pinterest"
      | "extractorUrl"
      | "system"
    >
  > => ipcRenderer.invoke("settings:set", partial),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke("history:clear"),
  clearPacks: (): Promise<boolean> => ipcRenderer.invoke("packs:clear"),
  removePacks: (ids: string[]): Promise<boolean> => ipcRenderer.invoke("packs:remove", ids),
  getRemote: (): Promise<RemoteConfig> => ipcRenderer.invoke("remote:get"),
  setRemote: (partial: {
    channels?: RemoteChannelConfig[];
    tunnel?: Partial<CloudflareTunnelConfig>;
  }): Promise<RemoteConfig> => ipcRenderer.invoke("remote:set", partial),
  upsertRemoteChannel: (
    channel: Partial<RemoteChannelConfig> & { id: string }
  ): Promise<RemoteConfig> => ipcRenderer.invoke("remote:upsertChannel", channel),
  testRemoteChannel: (payload: {
    id: string;
    botToken?: string;
    webhookUrl?: string;
  }): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke("remote:testChannel", payload),
  getRemoteRuntimeStatus: (): Promise<RemoteRuntimeStatus> =>
    ipcRenderer.invoke("remote:getRuntimeStatus"),
  listRemoteUsers: (filter?: {
    channel?: string;
    status?: RemoteUserStatus;
  }): Promise<RemoteUser[]> => ipcRenderer.invoke("remote:listUsers", filter),
  setRemoteUserStatus: (payload: {
    id: string;
    status: "approved" | "denied";
  }): Promise<RemoteUser[]> => ipcRenderer.invoke("remote:setUserStatus", payload),
  removeRemoteUser: (id: string): Promise<RemoteUser[]> => ipcRenderer.invoke("remote:removeUser", id),
  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke("shell:showItem", filePath),
  openPath: (filePath: string): Promise<string> => ipcRenderer.invoke("shell:openPath", filePath),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke("shell:openExternal", url),
  diskSpace: (dirPath?: string): Promise<DiskSpaceInfo | null> =>
    ipcRenderer.invoke("fs:diskSpace", dirPath),
  systemResources: (): Promise<SystemResourcesInfo> => ipcRenderer.invoke("system:resources"),
  fileSizes: (paths: string[]): Promise<Record<string, number>> =>
    ipcRenderer.invoke("fs:fileSizes", paths),
  zipFolder: (folderPath: string, outZipPath?: string): Promise<{ zipPath: string }> =>
    ipcRenderer.invoke("fs:zipFolder", folderPath, outZipPath),

  onMediaProgress: (cb: (event: MediaProgressEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: MediaProgressEvent) => cb(payload);
    ipcRenderer.on("media:progress", listener);
    return () => ipcRenderer.removeListener("media:progress", listener);
  },

  onClipboardUrls: (cb: (payload: { urls: string[] }) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { urls: string[] }) => cb(payload);
    ipcRenderer.on("clipboard:urls", listener);
    return () => ipcRenderer.removeListener("clipboard:urls", listener);
  },

  onQueueUpdated: (cb: (payload: { added: number }) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { added: number }) => cb(payload);
    ipcRenderer.on("queue:updated", listener);
    return () => ipcRenderer.removeListener("queue:updated", listener);
  },

  onRemoteRuntimeChanged: (cb: (status: RemoteRuntimeStatus) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: RemoteRuntimeStatus) => cb(payload);
    ipcRenderer.on("remote:runtimeChanged", listener);
    return () => ipcRenderer.removeListener("remote:runtimeChanged", listener);
  },

  onRemoteUsersChanged: (cb: (users: RemoteUser[]) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: RemoteUser[]) => cb(payload);
    ipcRenderer.on("remote:usersChanged", listener);
    return () => ipcRenderer.removeListener("remote:usersChanged", listener);
  },

  ffmpegStatus: (): Promise<{
    available: boolean;
    enabled: boolean;
    path: string;
    version?: string;
    source: "custom" | "bundled" | "path" | "none";
    installing: boolean;
  }> => ipcRenderer.invoke("tools:ffmpegStatus"),
  ffmpegInstall: (): Promise<{
    available: boolean;
    enabled: boolean;
    path: string;
    version?: string;
    source: "custom" | "bundled" | "path" | "none";
    installing: boolean;
  }> => ipcRenderer.invoke("tools:ffmpegInstall"),
  ffmpegPick: (): Promise<{
    available: boolean;
    enabled: boolean;
    path: string;
    version?: string;
    source: "custom" | "bundled" | "path" | "none";
    installing: boolean;
  } | null> => ipcRenderer.invoke("tools:ffmpegPick"),
  onFfmpegProgress: (
    cb: (event: { phase: string; percent: number; message: string }) => void
  ): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { phase: string; percent: number; message: string }
    ) => cb(payload);
    ipcRenderer.on("tools:ffmpegProgress", listener);
    return () => ipcRenderer.removeListener("tools:ffmpegProgress", listener);
  },

  ytdlpStatus: (): Promise<{
    available: boolean;
    enabled: boolean;
    path: string;
    version?: string;
    source: "custom" | "bundled" | "path" | "none";
    installing: boolean;
  }> => ipcRenderer.invoke("tools:ytdlpStatus"),
  ytdlpInstall: (): Promise<{
    available: boolean;
    enabled: boolean;
    path: string;
    version?: string;
    source: "custom" | "bundled" | "path" | "none";
    installing: boolean;
  }> => ipcRenderer.invoke("tools:ytdlpInstall"),
  ytdlpPick: (): Promise<{
    available: boolean;
    enabled: boolean;
    path: string;
    version?: string;
    source: "custom" | "bundled" | "path" | "none";
    installing: boolean;
  } | null> => ipcRenderer.invoke("tools:ytdlpPick"),
  onYtdlpProgress: (
    cb: (event: { phase: string; percent: number; message: string }) => void
  ): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { phase: string; percent: number; message: string }
    ) => cb(payload);
    ipcRenderer.on("tools:ytdlpProgress", listener);
    return () => ipcRenderer.removeListener("tools:ytdlpProgress", listener);
  },

  playwrightStatus: (): Promise<{
    available: boolean;
    path: string;
    version?: string;
    installing: boolean;
  }> => ipcRenderer.invoke("tools:playwrightStatus"),
  playwrightInstall: (): Promise<{
    available: boolean;
    path: string;
    version?: string;
    installing: boolean;
  }> => ipcRenderer.invoke("tools:playwrightInstall"),
  onPlaywrightProgress: (
    cb: (event: { phase: string; percent: number; message: string }) => void
  ): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { phase: string; percent: number; message: string }
    ) => cb(payload);
    ipcRenderer.on("tools:playwrightProgress", listener);
    return () => ipcRenderer.removeListener("tools:playwrightProgress", listener);
  },

  environmentSetupStatus: (): Promise<{
    needed: boolean;
    done: boolean;
    running: boolean;
    tools: {
      ffmpeg: { available: boolean; path?: string; version?: string };
      ytdlp: { available: boolean; path?: string; version?: string };
      playwright: { available: boolean; path?: string; version?: string };
    };
  }> => ipcRenderer.invoke("tools:environmentSetupStatus"),
  environmentSetupStart: (): Promise<{
    needed: boolean;
    done: boolean;
    running: boolean;
    tools: {
      ffmpeg: { available: boolean; path?: string; version?: string };
      ytdlp: { available: boolean; path?: string; version?: string };
      playwright: { available: boolean; path?: string; version?: string };
    };
  }> => ipcRenderer.invoke("tools:environmentSetupStart"),
  environmentSetupComplete: (): Promise<{
    needed: boolean;
    done: boolean;
    running: boolean;
    tools: {
      ffmpeg: { available: boolean; path?: string; version?: string };
      ytdlp: { available: boolean; path?: string; version?: string };
      playwright: { available: boolean; path?: string; version?: string };
    };
  }> => ipcRenderer.invoke("tools:environmentSetupComplete"),
  onEnvironmentSetupProgress: (
    cb: (event: {
      step: string;
      stepIndex: number;
      stepCount: number;
      phase: string;
      percent: number;
      message: string;
      toolAvailable?: boolean;
    }) => void
  ): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: {
        step: string;
        stepIndex: number;
        stepCount: number;
        phase: string;
        percent: number;
        message: string;
        toolAvailable?: boolean;
      }
    ) => cb(payload);
    ipcRenderer.on("tools:environmentSetupProgress", listener);
    return () => ipcRenderer.removeListener("tools:environmentSetupProgress", listener);
  },

  getUpdateStatus: (): Promise<AutoUpdateStatus> => ipcRenderer.invoke("update:getStatus"),
  checkForUpdates: (req?: UpdateCheckRequest): Promise<AutoUpdateStatus> =>
    ipcRenderer.invoke("update:check", req),
  downloadUpdate: (): Promise<AutoUpdateStatus> => ipcRenderer.invoke("update:download"),
  quitAndInstallUpdate: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke("update:quitAndInstall"),
  onUpdateStatus: (cb: (status: AutoUpdateStatus) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, status: AutoUpdateStatus) => cb(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },

  listJobs: (filter?: { status?: JobStatus[]; limit?: number }): Promise<DownloadJob[]> =>
    ipcRenderer.invoke("jobs:list", filter),
  getJob: (id: string): Promise<DownloadJob | null> => ipcRenderer.invoke("jobs:get", id),
  pauseJob: (id?: string): Promise<{ ok: boolean; message?: string; job: DownloadJob | null }> =>
    ipcRenderer.invoke("jobs:pause", id),
  resumeJob: (id: string): Promise<{ ok: boolean; job: DownloadJob }> =>
    ipcRenderer.invoke("jobs:resume", id),
  cancelJob: (payload?: {
    id?: string;
    deleteFiles?: boolean;
  }): Promise<{ ok: boolean; message?: string; job: DownloadJob | null }> =>
    ipcRenderer.invoke("jobs:cancel", payload ?? {}),
  recoverJobs: (): Promise<DownloadJob[]> => ipcRenderer.invoke("jobs:recover"),
  listUnfinishedJobs: (): Promise<DownloadJob[]> => ipcRenderer.invoke("jobs:listUnfinished"),

  windowMinimize: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
  windowToggleMaximize: (): Promise<void> => ipcRenderer.invoke("window:toggleMaximize"),
  windowClose: (): Promise<void> => ipcRenderer.invoke("window:close"),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:isMaximized"),
  setInstallerMode: (active: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("window:setInstallerMode", active),
  uninstallApp: (opts: { clearData: boolean }): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke("app:uninstall", opts),
  openUninstallWindow: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke("app:openUninstallWindow"),
  onWindowMaximizedChanged: (cb: (maximized: boolean) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, maximized: boolean) => cb(maximized);
    ipcRenderer.on("window:maximizedChanged", listener);
    return () => ipcRenderer.removeListener("window:maximizedChanged", listener);
  },
};

contextBridge.exposeInMainWorld("api", api);

export type DesktopApi = typeof api;

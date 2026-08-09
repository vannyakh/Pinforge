import { contextBridge, ipcRenderer } from "electron";

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
}

export type DownloadMode = "single" | "board" | "profile" | "playlist" | "story";

export interface ExtractPreviewItem {
  index: number;
  url: string;
  title?: string;
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
  version?: string;
  createdAt: number;
}

export interface AppSettings {
  outDir: string;
  preset: PresetName;
  delayMs: number;
  enhance: boolean;
  enhanceFeatures: EnhanceFeatures;
  autoDownload: boolean;
  format: FormatPreset;
  youtube: YoutubeDownloadOptions;
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
}

export type RemoteChannelId = string;

export interface RemoteChannelConfig {
  id: RemoteChannelId;
  label: string;
  enabled: boolean;
  available: boolean;
  botToken?: string;
  webhookUrl?: string;
  sendFilesBack: boolean;
  notes?: string;
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
}

export type SettingsPartial = Partial<{
  outDir: string;
  preset: PresetName;
  delayMs: number;
  enhance: boolean;
  enhanceFeatures: Partial<EnhanceFeatures>;
  autoDownload: boolean;
  format: FormatPreset;
  youtube: Partial<YoutubeDownloadOptions>;
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
}

const api = {
  processMedia: (payload: {
    url: string;
    preset: PresetName;
    outDir: string;
    enhance?: boolean;
    format?: FormatPreset;
    features?: Partial<EnhanceFeatures>;
    youtube?: Partial<YoutubeDownloadOptions>;
  }): Promise<ProcessResponse> => ipcRenderer.invoke("media:process", payload),
  processPin: (url: string, preset: PresetName, outDir: string): Promise<ProcessResponse> =>
    ipcRenderer.invoke("pin:process", { url, preset, outDir }),
  detectProvider: (url: string): Promise<DetectedProvider | null> =>
    ipcRenderer.invoke("media:detect", url),
  extractPreview: (url: string): Promise<ExtractPreview> =>
    ipcRenderer.invoke("media:extract", url),
  listProviders: (): Promise<ProviderInfo[]> => ipcRenderer.invoke("media:providers"),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("pin:pickFolder"),
  pickFolderPath: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pickFolder", defaultPath),
  pickProviderSource: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pickProviderSource"),
  pickFormatPlugin: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pickFormatPlugin"),
  listCustomProviders: (): Promise<CustomProviderConfig[]> =>
    ipcRenderer.invoke("providers:listCustom"),
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
      | "format"
      | "extractorUrl"
      | "system"
    >
  > => ipcRenderer.invoke("settings:set", partial),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke("history:clear"),
  getRemote: (): Promise<RemoteConfig> => ipcRenderer.invoke("remote:get"),
  setRemote: (partial: {
    channels?: RemoteChannelConfig[];
    tunnel?: Partial<CloudflareTunnelConfig>;
  }): Promise<RemoteConfig> => ipcRenderer.invoke("remote:set", partial),
  upsertRemoteChannel: (channel: Partial<RemoteChannelConfig> & { id: string }): Promise<RemoteConfig> =>
    ipcRenderer.invoke("remote:upsertChannel", channel),
  testRemoteChannel: (payload: {
    id: string;
    botToken?: string;
    webhookUrl?: string;
  }): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke("remote:testChannel", payload),
  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke("shell:showItem", filePath),
  openPath: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("shell:openPath", filePath),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:openExternal", url),

  onMediaProgress: (cb: (event: MediaProgressEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: MediaProgressEvent) => cb(payload);
    ipcRenderer.on("media:progress", listener);
    return () => ipcRenderer.removeListener("media:progress", listener);
  },

  windowMinimize: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
  windowToggleMaximize: (): Promise<void> => ipcRenderer.invoke("window:toggleMaximize"),
  windowClose: (): Promise<void> => ipcRenderer.invoke("window:close"),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:isMaximized"),
  onWindowMaximizedChanged: (cb: (maximized: boolean) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, maximized: boolean) => cb(maximized);
    ipcRenderer.on("window:maximizedChanged", listener);
    return () => ipcRenderer.removeListener("window:maximizedChanged", listener);
  },
};

contextBridge.exposeInMainWorld("api", api);

export type DesktopApi = typeof api;

import { contextBridge, ipcRenderer } from "electron";

export type PresetName = "auto" | "soft" | "crisp" | "upscale";
export type FormatPreset = "best" | "mp4" | "audio-only";
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
}

export interface DetectedProvider {
  id: string;
  label: string;
  live: boolean;
  formats: FormatPreset[];
}

export interface AppSettings {
  outDir: string;
  preset: PresetName;
  delayMs: number;
  enhance: boolean;
  format: FormatPreset;
  extractorUrl: string;
  history: HistoryItem[];
  packs: DownloadPack[];
  remote: RemoteConfig;
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
  format: FormatPreset;
  extractorUrl: string;
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
  }): Promise<ProcessResponse> => ipcRenderer.invoke("media:process", payload),
  processPin: (url: string, preset: PresetName, outDir: string): Promise<ProcessResponse> =>
    ipcRenderer.invoke("pin:process", { url, preset, outDir }),
  detectProvider: (url: string): Promise<DetectedProvider | null> =>
    ipcRenderer.invoke("media:detect", url),
  listProviders: (): Promise<ProviderInfo[]> => ipcRenderer.invoke("media:providers"),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("pin:pickFolder"),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  setSettings: (
    partial: SettingsPartial
  ): Promise<
    Pick<AppSettings, "outDir" | "preset" | "delayMs" | "enhance" | "format" | "extractorUrl">
  > => ipcRenderer.invoke("settings:set", partial),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke("history:clear"),
  getRemote: (): Promise<RemoteConfig> => ipcRenderer.invoke("remote:get"),
  setRemote: (partial: {
    channels?: RemoteChannelConfig[];
    tunnel?: Partial<CloudflareTunnelConfig>;
  }): Promise<RemoteConfig> => ipcRenderer.invoke("remote:set", partial),
  upsertRemoteChannel: (channel: Partial<RemoteChannelConfig> & { id: string }): Promise<RemoteConfig> =>
    ipcRenderer.invoke("remote:upsertChannel", channel),
  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke("shell:showItem", filePath),
  openPath: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("shell:openPath", filePath),

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

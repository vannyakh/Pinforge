import type {
  AppSettings,
  PresetName,
  ProcessResponse,
  HistoryItem,
  FormatPreset,
  SettingsPartial,
  DetectedProvider,
  ProviderInfo,
  DownloadPack,
  MediaProgressEvent,
  PackStatus,
  RemoteConfig,
  RemoteChannelConfig,
  CloudflareTunnelConfig,
} from "../../preload/index";

export type {
  AppSettings,
  PresetName,
  ProcessResponse,
  HistoryItem,
  FormatPreset,
  SettingsPartial,
  DetectedProvider,
  ProviderInfo,
  DownloadPack,
  MediaProgressEvent,
  PackStatus,
  RemoteConfig,
  RemoteChannelConfig,
  CloudflareTunnelConfig,
};

export const api = {
  processMedia: (payload: {
    url: string;
    preset: PresetName;
    outDir: string;
    enhance?: boolean;
    format?: FormatPreset;
  }) => window.api.processMedia(payload),
  processPin: (url: string, preset: PresetName, outDir: string) =>
    window.api.processPin(url, preset, outDir),
  detectProvider: (url: string) => window.api.detectProvider(url),
  listProviders: () => window.api.listProviders(),
  pickFolder: () => window.api.pickFolder(),
  getSettings: () => window.api.getSettings(),
  setSettings: (partial: SettingsPartial) => window.api.setSettings(partial),
  clearHistory: () => window.api.clearHistory(),
  getRemote: () => window.api.getRemote(),
  setRemote: (partial: {
    channels?: RemoteChannelConfig[];
    tunnel?: Partial<CloudflareTunnelConfig>;
  }) => window.api.setRemote(partial),
  upsertRemoteChannel: (channel: Partial<RemoteChannelConfig> & { id: string }) =>
    window.api.upsertRemoteChannel(channel),
  showItemInFolder: (filePath: string) => window.api.showItemInFolder(filePath),
  openPath: (filePath: string) => window.api.openPath(filePath),
  onMediaProgress: (cb: (event: MediaProgressEvent) => void) => window.api.onMediaProgress(cb),
};

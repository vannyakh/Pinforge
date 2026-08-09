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
  SystemConfig,
  CustomProviderConfig,
  FormatPluginConfig,
  ProviderManifest,
  EnhanceFeatures,
  ExtractPreview,
  ExtractPreviewItem,
  DownloadMode,
  YoutubeDownloadOptions,
  YoutubeQuality,
  AudioContainer,
  SubtitleMode,
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
  SystemConfig,
  CustomProviderConfig,
  FormatPluginConfig,
  ProviderManifest,
  EnhanceFeatures,
  ExtractPreview,
  ExtractPreviewItem,
  DownloadMode,
  YoutubeDownloadOptions,
  YoutubeQuality,
  AudioContainer,
  SubtitleMode,
};

export const api = {
  processMedia: (payload: {
    url: string;
    preset: PresetName;
    outDir: string;
    enhance?: boolean;
    format?: FormatPreset;
    features?: Partial<EnhanceFeatures>;
    youtube?: Partial<YoutubeDownloadOptions>;
  }) => window.api.processMedia(payload),
  processPin: (url: string, preset: PresetName, outDir: string) =>
    window.api.processPin(url, preset, outDir),
  detectProvider: (url: string) => window.api.detectProvider(url),
  extractPreview: (url: string) => window.api.extractPreview(url),
  listProviders: () => window.api.listProviders(),
  pickFolder: () => window.api.pickFolder(),
  pickFolderPath: (defaultPath?: string) => window.api.pickFolderPath(defaultPath),
  pickProviderSource: () => window.api.pickProviderSource(),
  pickFormatPlugin: () => window.api.pickFormatPlugin(),
  listCustomProviders: () => window.api.listCustomProviders(),
  upsertCustomProvider: (provider: CustomProviderConfig) => window.api.upsertCustomProvider(provider),
  removeCustomProvider: (id: string) => window.api.removeCustomProvider(id),
  installProviderFromSource: (sourcePath: string) => window.api.installProviderFromSource(sourcePath),
  readProviderManifest: (pathOrDir: string) => window.api.readProviderManifest(pathOrDir),
  uploadFormatPlugin: (sourcePath: string) => window.api.uploadFormatPlugin(sourcePath),
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
  testRemoteChannel: (payload: { id: string; botToken?: string; webhookUrl?: string }) =>
    window.api.testRemoteChannel(payload),
  showItemInFolder: (filePath: string) => window.api.showItemInFolder(filePath),
  openPath: (filePath: string) => window.api.openPath(filePath),
  openExternal: (url: string) => window.api.openExternal(url),
  onMediaProgress: (cb: (event: MediaProgressEvent) => void) => window.api.onMediaProgress(cb),
  ffmpegStatus: () => window.api.ffmpegStatus(),
  ffmpegInstall: () => window.api.ffmpegInstall(),
  ffmpegPick: () => window.api.ffmpegPick(),
  onFfmpegProgress: (
    cb: (event: { phase: string; percent: number; message: string }) => void
  ) => window.api.onFfmpegProgress(cb),
};

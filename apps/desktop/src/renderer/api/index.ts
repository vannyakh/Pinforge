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
  DiskSpaceInfo,
  SystemResourcesInfo,
  PinterestOptions,
  ProviderPrefs,
  RegistryListItem,
  InstalledProviderView,
  AutoUpdateStatus,
  UpdateCheckRequest,
  DownloadJob,
  JobStatus,
  JobProgress,
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
  DiskSpaceInfo,
  SystemResourcesInfo,
  PinterestOptions,
  ProviderPrefs,
  RegistryListItem,
  InstalledProviderView,
  AutoUpdateStatus,
  UpdateCheckRequest,
  DownloadJob,
  JobStatus,
  JobProgress,
};

export const api = {
  rendererReady: () => window.api.rendererReady(),
  getAppInfo: () => window.api.getAppInfo(),
  processMedia: (payload: {
    url: string;
    preset: PresetName;
    outDir: string;
    enhance?: boolean;
    format?: FormatPreset;
    features?: Partial<EnhanceFeatures>;
    youtube?: Partial<YoutubeDownloadOptions>;
    pinterest?: Partial<PinterestOptions>;
  }) => window.api.processMedia(payload),
  cancelMedia: () => window.api.cancelMedia(),
  processPin: (url: string, preset: PresetName, outDir: string) =>
    window.api.processPin(url, preset, outDir),
  detectProvider: (url: string) => window.api.detectProvider(url),
  extractPreview: (
    url: string,
    opts?: {
      channelMaxVideos?: number;
      playlistMaxVideos?: number;
      boardMaxPins?: number;
      preferPlaylist?: boolean;
    }
  ) => window.api.extractPreview(url, opts),
  listProviders: () => window.api.listProviders(),
  pickFolder: () => window.api.pickFolder(),
  pickFolderPath: (defaultPath?: string) => window.api.pickFolderPath(defaultPath),
  pickProviderSource: () => window.api.pickProviderSource(),
  pickFormatPlugin: () => window.api.pickFormatPlugin(),
  listCustomProviders: () => window.api.listCustomProviders(),
  listInstalledProviders: () => window.api.listInstalledProviders(),
  registryList: () => window.api.registryList(),
  setProviderEnabled: (id: string, enabled: boolean) => window.api.setProviderEnabled(id, enabled),
  installFromRegistry: (id: string) => window.api.installFromRegistry(id),
  uninstallProvider: (id: string) => window.api.uninstallProvider(id),
  upsertCustomProvider: (provider: CustomProviderConfig) =>
    window.api.upsertCustomProvider(provider),
  removeCustomProvider: (id: string) => window.api.removeCustomProvider(id),
  installProviderFromSource: (sourcePath: string) =>
    window.api.installProviderFromSource(sourcePath),
  readProviderManifest: (pathOrDir: string) => window.api.readProviderManifest(pathOrDir),
  uploadFormatPlugin: (sourcePath: string) => window.api.uploadFormatPlugin(sourcePath),
  getSettings: () => window.api.getSettings(),
  setSettings: (partial: SettingsPartial) => window.api.setSettings(partial),
  clearHistory: () => window.api.clearHistory(),
  clearPacks: () => window.api.clearPacks(),
  removePacks: (ids: string[]) => window.api.removePacks(ids),
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
  diskSpace: (dirPath?: string) => window.api.diskSpace(dirPath),
  systemResources: () => window.api.systemResources(),
  fileSizes: (paths: string[]) => window.api.fileSizes(paths),
  zipFolder: (folderPath: string, outZipPath?: string) =>
    window.api.zipFolder(folderPath, outZipPath),
  onMediaProgress: (cb: (event: MediaProgressEvent) => void) => window.api.onMediaProgress(cb),
  ffmpegStatus: () => window.api.ffmpegStatus(),
  ffmpegInstall: () => window.api.ffmpegInstall(),
  ffmpegPick: () => window.api.ffmpegPick(),
  onFfmpegProgress: (cb: (event: { phase: string; percent: number; message: string }) => void) =>
    window.api.onFfmpegProgress(cb),
  ytdlpStatus: () => window.api.ytdlpStatus(),
  ytdlpInstall: () => window.api.ytdlpInstall(),
  ytdlpPick: () => window.api.ytdlpPick(),
  onYtdlpProgress: (cb: (event: { phase: string; percent: number; message: string }) => void) =>
    window.api.onYtdlpProgress(cb),
  playwrightStatus: () => window.api.playwrightStatus(),
  playwrightInstall: () => window.api.playwrightInstall(),
  onPlaywrightProgress: (
    cb: (event: { phase: string; percent: number; message: string }) => void
  ) => window.api.onPlaywrightProgress(cb),
  environmentSetupStatus: () => window.api.environmentSetupStatus(),
  environmentSetupStart: () => window.api.environmentSetupStart(),
  environmentSetupComplete: () => window.api.environmentSetupComplete(),
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
  ) => window.api.onEnvironmentSetupProgress(cb),
  setInstallerMode: (active: boolean) => window.api.setInstallerMode(active),
  getUpdateStatus: () => window.api.getUpdateStatus(),
  checkForUpdates: (req?: UpdateCheckRequest) => window.api.checkForUpdates(req),
  downloadUpdate: () => window.api.downloadUpdate(),
  quitAndInstallUpdate: () => window.api.quitAndInstallUpdate(),
  onUpdateStatus: (cb: (status: AutoUpdateStatus) => void) => window.api.onUpdateStatus(cb),
  listJobs: (filter?: { status?: JobStatus[]; limit?: number }) => window.api.listJobs(filter),
  getJob: (id: string) => window.api.getJob(id),
  pauseJob: (id?: string) => window.api.pauseJob(id),
  resumeJob: (id: string) => window.api.resumeJob(id),
  cancelJob: (payload?: { id?: string; deleteFiles?: boolean }) => window.api.cancelJob(payload),
  recoverJobs: () => window.api.recoverJobs(),
  listUnfinishedJobs: () => window.api.listUnfinishedJobs(),
};

import type { RemoteBotOptions, RemoteChannelConfig } from "../../common/remote/types";

export const DEFAULT_BOT_OPTIONS: Required<RemoteBotOptions> = {
  welcomeMessage: "",
  downloadMode: "immediate",
  notifyOnComplete: true,
  maxUrlsPerMessage: 3,
  detectBeforeDownload: true,
  confirmBeforeDownload: true,
  allowQualitySelect: true,
  adminChatId: "",
};

export function resolveBotOptions(channel?: RemoteChannelConfig): Required<RemoteBotOptions> {
  return { ...DEFAULT_BOT_OPTIONS, ...(channel?.botOptions ?? {}) };
}

export function clampMaxUrls(n: number | undefined): number {
  const v = Math.floor(n ?? DEFAULT_BOT_OPTIONS.maxUrlsPerMessage);
  return Math.max(1, Math.min(10, v || 1));
}

/** Remote chatbot channels + Cloudflare tunnel (send files back to bots). */

export type RemoteChannelId = "telegram" | "discord";

export type RemoteUserStatus = "pending" | "approved" | "denied";

export type RemoteBotDownloadMode = "immediate" | "queue";

/** Per-channel bot behavior (Telegram, etc.). */
export interface RemoteBotOptions {
  /** Custom message for approved users on /start. Empty = built-in default. */
  welcomeMessage?: string;
  /** Start download immediately or add to the Tasks queue. */
  downloadMode?: RemoteBotDownloadMode;
  /** Send a text summary when a download finishes. */
  notifyOnComplete?: boolean;
  /** Max URLs processed from one message (1–10). */
  maxUrlsPerMessage?: number;
  /** Reply with detected provider before starting a download. */
  detectBeforeDownload?: boolean;
  /** Show Download / Cancel buttons and wait for confirmation before starting. */
  confirmBeforeDownload?: boolean;
  /** Show quality / format buttons on the confirm menu (YouTube quality + format presets). */
  allowQualitySelect?: boolean;
  /** Telegram group/channel chat id for access requests (bot must be a member). */
  adminChatId?: string;
}

/** A chat user who requested access via a remote channel bot. */
export interface RemoteUser {
  id: string;
  channel: RemoteChannelId | string;
  /** Platform user/chat id (Telegram chat id as string). */
  externalId: string;
  username?: string;
  displayName?: string;
  status: RemoteUserStatus;
  requestedAt: number;
  decidedAt?: number;
  /** Admin-channel message id for the access request card. */
  adminMessageId?: number;
}

export interface RemoteChannelConfig {
  id: RemoteChannelId | string;
  label: string;
  enabled: boolean;
  /** false = UI only / coming soon */
  available: boolean;
  botToken?: string;
  webhookUrl?: string;
  /** Allow Pinforge to POST/send downloaded files back to the bot */
  sendFilesBack: boolean;
  /** New users must be approved via the admin Telegram channel before they can download. */
  requireApproval?: boolean;
  /** Bot commands and download behavior. */
  botOptions?: RemoteBotOptions;
  notes?: string;
}

export interface CloudflareTunnelConfig {
  enabled: boolean;
  /** cloudflared tunnel token or named tunnel id */
  token: string;
  /** Public hostname e.g. pinforge.example.com */
  hostname: string;
  /** Local listen port for the inbound API that bots call */
  localPort: number;
  /** Expose download packs / file send-back over the tunnel */
  allowFileSendBack: boolean;
  /** Optional path to cloudflared binary */
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

export const DEFAULT_REMOTE_CHANNELS: RemoteChannelConfig[] = [
  {
    id: "telegram",
    label: "Telegram",
    enabled: false,
    available: true,
    botToken: "",
    sendFilesBack: true,
    requireApproval: true,
    botOptions: {
      downloadMode: "immediate",
      notifyOnComplete: true,
      maxUrlsPerMessage: 3,
      detectBeforeDownload: true,
      confirmBeforeDownload: true,
      allowQualitySelect: true,
    },
  },
  {
    id: "discord",
    label: "Discord",
    enabled: false,
    available: true,
    botToken: "",
    webhookUrl: "",
    sendFilesBack: true,
  },
];

export const DEFAULT_TUNNEL: CloudflareTunnelConfig = {
  enabled: false,
  token: "",
  hostname: "",
  localPort: 8787,
  allowFileSendBack: true,
  binaryPath: "",
  status: "stopped",
};

export const DEFAULT_REMOTE: RemoteConfig = {
  channels: DEFAULT_REMOTE_CHANNELS,
  tunnel: DEFAULT_TUNNEL,
  users: [],
};

export type RemoteRuntimeStatus = {
  api: { running: boolean; port: number; url: string | null; error?: string };
  telegram: { running: boolean; username?: string; error?: string };
  tunnel: { running: boolean; publicUrl?: string; error?: string };
};

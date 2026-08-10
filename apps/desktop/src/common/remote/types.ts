/** Remote chatbot channels + Cloudflare tunnel (send files back to bots). */

export type RemoteChannelId =
  "telegram" | "discord" | "slack" | "lark" | "wechat" | "line" | "webhook";

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
}

export const DEFAULT_REMOTE_CHANNELS: RemoteChannelConfig[] = [
  {
    id: "telegram",
    label: "Telegram",
    enabled: false,
    available: true,
    botToken: "",
    sendFilesBack: true,
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
  {
    id: "slack",
    label: "Slack",
    enabled: false,
    available: false,
    sendFilesBack: true,
  },
  {
    id: "lark",
    label: "Lark",
    enabled: false,
    available: false,
    sendFilesBack: true,
  },
  {
    id: "wechat",
    label: "WeChat",
    enabled: false,
    available: false,
    sendFilesBack: false,
  },
  {
    id: "line",
    label: "LINE",
    enabled: false,
    available: false,
    sendFilesBack: true,
  },
  {
    id: "webhook",
    label: "Custom webhook",
    enabled: false,
    available: true,
    webhookUrl: "",
    sendFilesBack: true,
    notes: "Generic HTTP webhook for your own chatbot agent",
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
};

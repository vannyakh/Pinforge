import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Collapse,
  Input,
  InputNumber,
  Message,
  Switch,
  Tabs,
  Tag,
  Typography,
} from "@arco-design/web-react";
import { CheckOne, Communication, Plus } from "@icon-park/react";
import {
  api,
  type CloudflareTunnelConfig,
  type RemoteChannelConfig,
  type RemoteConfig,
} from "@renderer/api";
import telegramLogo from "@renderer/assets/channel-logos/telegram.svg";
import discordLogo from "@renderer/assets/channel-logos/discord.svg";
import slackLogo from "@renderer/assets/channel-logos/slack.svg";
import larkLogo from "@renderer/assets/channel-logos/lark.svg";
import weixinLogo from "@renderer/assets/channel-logos/weixin.svg";
import wecomLogo from "@renderer/assets/channel-logos/wecom.svg";
import dingtalkLogo from "@renderer/assets/channel-logos/dingtalk.svg";
import lineLogo from "@renderer/assets/channel-logos/line.svg";
import webhookLogo from "@renderer/assets/channel-logos/webhook.svg";
import cloudflareLogo from "@renderer/assets/channel-logos/cloudflare.svg";

const CHANNEL_LOGOS: Record<string, { src: string; alt: string }> = {
  telegram: { src: telegramLogo, alt: "Telegram" },
  discord: { src: discordLogo, alt: "Discord" },
  slack: { src: slackLogo, alt: "Slack" },
  lark: { src: larkLogo, alt: "Lark" },
  wechat: { src: weixinLogo, alt: "WeChat" },
  weixin: { src: weixinLogo, alt: "WeChat" },
  wecom: { src: wecomLogo, alt: "WeCom" },
  dingtalk: { src: dingtalkLogo, alt: "DingTalk" },
  line: { src: lineLogo, alt: "LINE" },
  webhook: { src: webhookLogo, alt: "Webhook" },
};

const CHANNEL_TAB_LOGOS = [
  { src: telegramLogo, alt: "Telegram" },
  { src: discordLogo, alt: "Discord" },
  { src: slackLogo, alt: "Slack" },
  { src: larkLogo, alt: "Lark" },
  { src: weixinLogo, alt: "WeChat" },
  { src: lineLogo, alt: "LINE" },
  { src: webhookLogo, alt: "Webhook" },
] as const;

function channelKey(id: string): string {
  return id.startsWith("webhook") ? "webhook" : id;
}

const ChannelIcon: React.FC<{ id: string; label?: string }> = ({ id, label }) => {
  const logo = CHANNEL_LOGOS[channelKey(id)];
  if (logo) {
    return <img className="remote-channel-logo" src={logo.src} alt={logo.alt} draggable={false} />;
  }
  return (
    <span className="remote-channel-icon remote-channel-icon--fallback" aria-hidden>
      {(label?.[0] ?? id[0] ?? "?").toUpperCase()}
    </span>
  );
};

const PreferenceRow: React.FC<{
  label: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="remote-pref-row">
    <div className="remote-pref-row__meta">
      <div className="text-14px text-t-primary">{label}</div>
      {description && (
        <div className="text-12px text-t-tertiary mt-4px leading-relaxed">{description}</div>
      )}
    </div>
    <div className="remote-pref-row__control">{children}</div>
  </div>
);

const STEPS = [
  "Select a channel and configure credentials.",
  "Enable the channel and (optionally) Cloudflare tunnel for inbound access.",
  "Allow file send-back so the bot can receive the download pack.",
];

type ChannelFormProps = {
  channel: RemoteChannelConfig;
  saving: boolean;
  onLocalChange: (patch: Partial<RemoteChannelConfig>) => void;
  onSave: (channel: RemoteChannelConfig) => Promise<void>;
};

const ChannelConfigForm: React.FC<ChannelFormProps> = ({
  channel,
  saving,
  onLocalChange,
  onSave,
}) => {
  const [testing, setTesting] = useState(false);
  const key = channelKey(String(channel.id));
  const isTelegram = key === "telegram";
  const isDiscord = key === "discord";
  const isWebhook = key === "webhook";
  const canTest = isTelegram || isDiscord || isWebhook;

  const persist = async (patch: Partial<RemoteChannelConfig>) => {
    const next = { ...channel, ...patch };
    onLocalChange(patch);
    await onSave(next);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await onSave(channel);
      const res = await api.testRemoteChannel({
        id: String(channel.id),
        botToken: channel.botToken,
        webhookUrl: channel.webhookUrl,
      });
      if (res.ok) Message.success(res.message);
      else Message.error(res.message);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  if (!channel.available) {
    return (
      <div className="text-13px text-t-tertiary py-8px">
        This platform integration is not available yet. Credentials and runtime will land in a later
        update.
      </div>
    );
  }

  return (
    <div className="remote-channel-form flex flex-col gap-4px">
      {isTelegram && (
        <PreferenceRow
          label="Bot Token"
          description={
            <>
              Open Telegram, find <code>@BotFather</code> and send <code>/newbot</code> to get your
              Bot Token.
            </>
          }
        >
          <div className="flex items-center gap-8px">
            <Input.Password
              style={{ width: 260 }}
              placeholder="123456:ABC-DEF…"
              value={channel.botToken ?? ""}
              onChange={(v) => onLocalChange({ botToken: v })}
              onBlur={() => void onSave(channel)}
            />
            <Button
              type="outline"
              loading={testing}
              disabled={saving}
              onClick={() => void handleTest()}
            >
              Test
            </Button>
          </div>
        </PreferenceRow>
      )}

      {isDiscord && (
        <>
          <PreferenceRow
            label="Bot Token"
            description="Create a bot in the Discord Developer Portal and paste the token."
          >
            <div className="flex items-center gap-8px">
              <Input.Password
                style={{ width: 260 }}
                placeholder="Discord bot token"
                value={channel.botToken ?? ""}
                onChange={(v) => onLocalChange({ botToken: v })}
                onBlur={() => void onSave(channel)}
              />
              <Button
                type="outline"
                loading={testing}
                disabled={saving}
                onClick={() => void handleTest()}
              >
                Test
              </Button>
            </div>
          </PreferenceRow>
          <PreferenceRow
            label="Webhook URL"
            description="Optional. Used to post download results into a channel."
          >
            <Input
              style={{ width: 320 }}
              placeholder="https://discord.com/api/webhooks/…"
              value={channel.webhookUrl ?? ""}
              onChange={(v) => onLocalChange({ webhookUrl: v })}
              onBlur={() => void onSave(channel)}
            />
          </PreferenceRow>
        </>
      )}

      {isWebhook && (
        <>
          <PreferenceRow
            label="Display name"
            description="Shown in the channel list for this custom agent."
          >
            <Input
              style={{ width: 260 }}
              placeholder="Custom agent"
              value={channel.label}
              onChange={(v) => onLocalChange({ label: v })}
              onBlur={() => void onSave({ ...channel })}
            />
          </PreferenceRow>
          <PreferenceRow
            label="Webhook URL"
            description="HTTPS endpoint Pinforge will call when a download finishes (if send-back is on)."
          >
            <div className="flex items-center gap-8px">
              <Input
                style={{ width: 280 }}
                placeholder="https://…"
                value={channel.webhookUrl ?? ""}
                onChange={(v) => onLocalChange({ webhookUrl: v })}
                onBlur={() => void onSave(channel)}
              />
              {canTest && (
                <Button
                  type="outline"
                  loading={testing}
                  disabled={saving}
                  onClick={() => void handleTest()}
                >
                  Test
                </Button>
              )}
            </div>
          </PreferenceRow>
          <PreferenceRow label="Notes" description="Optional description for this agent.">
            <Input
              style={{ width: 320 }}
              placeholder="Notes"
              value={channel.notes ?? ""}
              onChange={(v) => onLocalChange({ notes: v })}
              onBlur={() => void onSave(channel)}
            />
          </PreferenceRow>
        </>
      )}

      <PreferenceRow
        label="Send files back to bot"
        description="After download, push the finished file/pack to this channel."
      >
        <Switch
          checked={channel.sendFilesBack}
          disabled={saving}
          onChange={(v) => void persist({ sendFilesBack: v })}
        />
      </PreferenceRow>
    </div>
  );
};

const ChannelMenuItem: React.FC<{
  channel: RemoteChannelConfig;
  open: boolean;
  saving: boolean;
  onToggleOpen: () => void;
  onLocalChange: (patch: Partial<RemoteChannelConfig>) => void;
  onSave: (channel: RemoteChannelConfig) => Promise<void>;
}> = ({ channel, open, saving, onToggleOpen, onLocalChange, onSave }) => (
  <div className="remote-channel-card" data-channel-id={channel.id}>
    <Collapse
      bordered={false}
      activeKey={open ? ["body"] : []}
      onChange={onToggleOpen}
      className="remote-channel-collapse"
    >
      <Collapse.Item
        name="body"
        header={
          <div className="remote-channel-header">
            <div className="remote-channel-header__platform">
              <ChannelIcon id={String(channel.id)} label={channel.label} />
              <span className="remote-channel-header__name">{channel.label}</span>
              {!channel.available && (
                <Tag size="small" color="gray">
                  Coming soon
                </Tag>
              )}
            </div>
            <Switch
              checked={channel.enabled}
              disabled={!channel.available || saving}
              onChange={(v) => void onSave({ ...channel, enabled: v })}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        }
      >
        <ChannelConfigForm
          channel={channel}
          saving={saving}
          onLocalChange={onLocalChange}
          onSave={onSave}
        />
      </Collapse.Item>
    </Collapse>
  </div>
);

const RemoteSettings: React.FC = () => {
  const [remote, setRemote] = useState<RemoteConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("tunnel");
  const [openId, setOpenId] = useState<string | null>("telegram");

  const load = useCallback(async () => {
    const r = await api.getRemote();
    setRemote(r);
  }, []);

  useEffect(() => {
    load().catch((e) => Message.error(e instanceof Error ? e.message : String(e)));
  }, [load]);

  const saveTunnel = async (partial: Partial<CloudflareTunnelConfig>) => {
    if (!remote) return;
    setSaving(true);
    try {
      const next = await api.setRemote({ tunnel: partial });
      setRemote(next);
    } finally {
      setSaving(false);
    }
  };

  const saveChannel = async (channel: RemoteChannelConfig) => {
    setSaving(true);
    try {
      const next = await api.upsertRemoteChannel(channel);
      setRemote(next);
    } finally {
      setSaving(false);
    }
  };

  const patchChannelLocal = (id: string, patch: Partial<RemoteChannelConfig>) => {
    setRemote((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        channels: prev.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      };
    });
  };

  const addCustomWebhook = async () => {
    const id = `webhook-${Date.now().toString(36)}`;
    const channel: RemoteChannelConfig = {
      id,
      label: "Custom agent",
      enabled: false,
      available: true,
      webhookUrl: "",
      sendFilesBack: true,
      notes: "Your chatbot agent webhook",
    };
    await saveChannel(channel);
    setOpenId(id);
    Message.success("Platform added");
  };

  if (!remote) {
    return <div className="text-t-secondary">Loading…</div>;
  }

  const tunnel = remote.tunnel;

  return (
    <div className="remote-page max-w-760px w-full">
      <div className="text-22px font-600 text-t-primary mb-6px">Remote</div>
      <div className="text-t-secondary text-14px mb-20px">
        Connect chatbot agents online. Use a Cloudflare tunnel so bots can reach this app and
        receive downloaded files.
      </div>

      <Tabs activeTab={tab} onChange={setTab} type="line" className="mb-12px settings-remote-tabs">
        <Tabs.TabPane
          key="tunnel"
          title={
            <span
              className={`remote-tab-label inline-flex items-center gap-6px ${
                tab === "tunnel" ? "text-t-primary font-600" : "text-t-secondary"
              }`}
            >
              <img src={cloudflareLogo} alt="" className="remote-tab-cf-icon" />
              <span>Cloudflare</span>
            </span>
          }
        >
          <div className="flex items-start gap-14px mb-20px">
            <span className="remote-tunnel-icon">
              <img src={cloudflareLogo} alt="Cloudflare" />
            </span>
            <div>
              <div className="text-16px font-600 text-t-primary mb-4px">Cloudflare Tunnel</div>
              <div className="text-13px text-t-secondary leading-relaxed">
                Expose a local Pinforge API over HTTPS so online chatbot agents can request
                downloads and receive files. Requires{" "}
                <a
                  href="https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/"
                  target="_blank"
                  rel="noreferrer"
                >
                  cloudflared
                </a>
                .
              </div>
            </div>
          </div>

          <div className="bg-2 border border-b-base rd-12px p-18px flex flex-col gap-8px">
            <PreferenceRow
              label="Enable tunnel"
              description={
                <>
                  Status:{" "}
                  <Tag
                    size="small"
                    color={
                      tunnel.status === "running"
                        ? "green"
                        : tunnel.status === "error"
                          ? "red"
                          : "gray"
                    }
                  >
                    {tunnel.status}
                  </Tag>
                </>
              }
            >
              <Switch
                checked={tunnel.enabled}
                disabled={saving}
                onChange={(v) =>
                  void saveTunnel({
                    enabled: v,
                    status: v ? "starting" : "stopped",
                    lastError: v
                      ? "Tunnel runner not started yet — config saved. Runtime connect coming soon."
                      : undefined,
                  }).then(() => {
                    if (v) {
                      Message.info(
                        "Tunnel settings saved. cloudflared process control is coming soon — use cloudflared CLI with this token for now."
                      );
                    }
                  })
                }
              />
            </PreferenceRow>

            <PreferenceRow
              label="Tunnel token"
              description="From the Cloudflare Zero Trust dashboard."
            >
              <Input.Password
                style={{ width: 320 }}
                placeholder="Cloudflare tunnel token"
                value={tunnel.token}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, token: v } })}
                onBlur={() => void saveTunnel({ token: tunnel.token })}
              />
            </PreferenceRow>

            <PreferenceRow label="Public hostname" description="Hostname served by the tunnel.">
              <Input
                style={{ width: 280 }}
                placeholder="pinforge.example.com"
                value={tunnel.hostname}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, hostname: v } })}
                onBlur={() => void saveTunnel({ hostname: tunnel.hostname })}
              />
            </PreferenceRow>

            <PreferenceRow label="Local API port" description="Port Pinforge listens on locally.">
              <InputNumber
                style={{ width: 140 }}
                min={1024}
                max={65535}
                value={tunnel.localPort}
                onChange={(v) => {
                  const port = Number(v) || 8787;
                  setRemote({ ...remote, tunnel: { ...tunnel, localPort: port } });
                  void saveTunnel({ localPort: port });
                }}
              />
            </PreferenceRow>

            <PreferenceRow
              label="cloudflared path"
              description="Optional. Leave empty to use PATH."
            >
              <Input
                style={{ width: 320 }}
                placeholder="Leave empty to use PATH"
                value={tunnel.binaryPath}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, binaryPath: v } })}
                onBlur={() => void saveTunnel({ binaryPath: tunnel.binaryPath })}
              />
            </PreferenceRow>

            <PreferenceRow
              label="Allow file send-back over tunnel"
              description="Bots can fetch completed download packs via the public URL."
            >
              <Switch
                checked={tunnel.allowFileSendBack}
                disabled={saving}
                onChange={(v) => void saveTunnel({ allowFileSendBack: v })}
              />
            </PreferenceRow>

            {tunnel.publicUrl && (
              <div className="text-12px text-t-secondary break-all pt-8px">
                Public URL: {tunnel.publicUrl}
              </div>
            )}
            {tunnel.lastError && (
              <Typography.Text type="warning" style={{ fontSize: 12 }}>
                {tunnel.lastError}
              </Typography.Text>
            )}
          </div>
        </Tabs.TabPane>

        <Tabs.TabPane
          key="channels"
          title={
            <span
              className={`remote-tab-channels inline-flex items-center gap-6px ${
                tab === "channels" ? "is-active text-t-primary font-600" : "text-t-secondary"
              }`}
            >
              <Communication theme="outline" size="15" fill="currentColor" />
              <span>Channels</span>
              <span className="remote-tab-channel-icons">
                {CHANNEL_TAB_LOGOS.map((item) => (
                  <span key={item.alt} className="remote-tab-channel-dot" title={item.alt}>
                    <img src={item.src} alt={item.alt} />
                  </span>
                ))}
              </span>
            </span>
          }
        >
          <div className="text-14px text-t-secondary mb-14px leading-relaxed">
            Connect Telegram, Discord, and webhooks so agents can request downloads and receive
            finished packs.
          </div>

          <div className="remote-steps mb-18px">
            {STEPS.map((step, i) => (
              <div key={step} className="remote-step">
                <CheckOne theme="filled" size="16" fill="var(--success, #00b42a)" />
                <span>
                  <span className="text-t-tertiary mr-4px">{i + 1}.</span>
                  {step}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end mb-12px">
            <Button
              size="small"
              icon={<Plus theme="outline" size="14" />}
              onClick={() => void addCustomWebhook()}
            >
              Add platform
            </Button>
          </div>

          <div className="remote-channel-menu flex flex-col gap-10px">
            {remote.channels.map((ch) => (
              <ChannelMenuItem
                key={ch.id}
                channel={ch}
                open={openId === ch.id}
                saving={saving}
                onToggleOpen={() => setOpenId((cur) => (cur === ch.id ? null : ch.id))}
                onLocalChange={(patch) => patchChannelLocal(ch.id, patch)}
                onSave={saveChannel}
              />
            ))}
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default RemoteSettings;

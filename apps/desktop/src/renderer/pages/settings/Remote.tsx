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
import { LinkCloud, Plus } from "@icon-park/react";
import { api, type CloudflareTunnelConfig, type RemoteChannelConfig, type RemoteConfig } from "@renderer/api";

const ChannelIcon: React.FC<{ id: string }> = ({ id }) => {
  const letter = (id[0] ?? "?").toUpperCase();
  const colors: Record<string, string> = {
    telegram: "#229ED9",
    discord: "#5865F2",
    slack: "#E01E5A",
    lark: "#00D6B9",
    wechat: "#07C160",
    line: "#06C755",
    webhook: "#86909c",
  };
  return (
    <span
      className="remote-channel-icon"
      style={{ background: colors[id] ?? "var(--bg-3)", color: "#fff" }}
    >
      {letter}
    </span>
  );
};

const RemoteSettings: React.FC = () => {
  const [remote, setRemote] = useState<RemoteConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("channels");

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
    Message.success("Platform added");
  };

  if (!remote) {
    return <div className="text-t-secondary">Loading…</div>;
  }

  const tunnel = remote.tunnel;

  return (
    <div className="remote-page max-w-720px">
      <div className="text-22px font-600 text-t-primary mb-6px">Remote</div>
      <div className="text-t-secondary text-14px mb-20px">
        Connect chatbot agents online. Use a Cloudflare tunnel so bots can reach this app and
        receive downloaded files.
      </div>

      <Tabs activeTab={tab} onChange={setTab}>
        <Tabs.TabPane key="channels" title="Channels">
          <div className="text-14px text-t-secondary mb-16px leading-relaxed">
            Connect Telegram, Discord, and webhooks so agents can request downloads. Enable a
            channel, add credentials, and turn on file send-back when the bot should receive the
            finished file.
          </div>
          <ol className="text-13px text-t-tertiary pl-18px mb-18px leading-relaxed">
            <li>Select a channel and configure credentials.</li>
            <li>Enable the channel and (optionally) Cloudflare tunnel for inbound access.</li>
            <li>Allow file send-back so the bot can receive the download pack.</li>
          </ol>

          <div className="flex justify-end mb-12px">
            <Button size="small" icon={<Plus theme="outline" size="14" />} onClick={() => void addCustomWebhook()}>
              Add platform
            </Button>
          </div>

          <Collapse bordered={false} className="remote-channel-list">
            {remote.channels.map((ch) => (
              <Collapse.Item
                key={ch.id}
                name={ch.id}
                header={
                  <div className="flex items-center justify-between gap-12px w-full pr-8px">
                    <div className="flex items-center gap-12px min-w-0">
                      <ChannelIcon id={String(ch.id).split("-")[0]!} />
                      <span className="text-14px font-500 text-t-primary">{ch.label}</span>
                      {!ch.available && (
                        <Tag size="small" color="orangered">
                          Coming soon
                        </Tag>
                      )}
                    </div>
                    <Switch
                      checked={ch.enabled}
                      disabled={!ch.available || saving}
                      onChange={(v) => {
                        void saveChannel({ ...ch, enabled: v });
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                }
              >
                {!ch.available ? (
                  <Typography.Text type="secondary">
                    This platform integration is not available yet.
                  </Typography.Text>
                ) : (
                  <div className="flex flex-col gap-14px pt-4px">
                    {(ch.id === "telegram" ||
                      ch.id === "discord" ||
                      String(ch.id).startsWith("webhook")) && (
                      <div>
                        <div className="text-12px text-t-tertiary mb-6px">
                          {ch.id === "telegram" || ch.id === "discord" ? "Bot token" : "Webhook URL"}
                        </div>
                        {ch.id === "telegram" || ch.id === "discord" ? (
                          <Input.Password
                            placeholder="Paste bot token"
                            value={ch.botToken ?? ""}
                            onChange={(v) => setRemote({
                              ...remote,
                              channels: remote.channels.map((c) =>
                                c.id === ch.id ? { ...c, botToken: v } : c
                              ),
                            })}
                            onBlur={() => {
                              const latest = remote.channels.find((c) => c.id === ch.id);
                              if (latest) void saveChannel(latest);
                            }}
                          />
                        ) : (
                          <Input
                            placeholder="https://…"
                            value={ch.webhookUrl ?? ""}
                            onChange={(v) => setRemote({
                              ...remote,
                              channels: remote.channels.map((c) =>
                                c.id === ch.id ? { ...c, webhookUrl: v } : c
                              ),
                            })}
                            onBlur={() => {
                              const latest = remote.channels.find((c) => c.id === ch.id);
                              if (latest) void saveChannel(latest);
                            }}
                          />
                        )}
                      </div>
                    )}

                    {ch.id === "discord" && (
                      <div>
                        <div className="text-12px text-t-tertiary mb-6px">Webhook URL (optional)</div>
                        <Input
                          placeholder="https://discord.com/api/webhooks/…"
                          value={ch.webhookUrl ?? ""}
                          onChange={(v) => setRemote({
                            ...remote,
                            channels: remote.channels.map((c) =>
                              c.id === ch.id ? { ...c, webhookUrl: v } : c
                            ),
                          })}
                          onBlur={() => {
                            const latest = remote.channels.find((c) => c.id === ch.id);
                            if (latest) void saveChannel(latest);
                          }}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-13px text-t-primary">Send files back to bot</div>
                        <div className="text-12px text-t-tertiary">
                          After download, push the file/pack to this channel
                        </div>
                      </div>
                      <Switch
                        checked={ch.sendFilesBack}
                        disabled={saving}
                        onChange={(v) => void saveChannel({ ...ch, sendFilesBack: v })}
                      />
                    </div>

                    {ch.notes && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {ch.notes}
                      </Typography.Text>
                    )}
                  </div>
                )}
              </Collapse.Item>
            ))}
          </Collapse>
        </Tabs.TabPane>

        <Tabs.TabPane key="tunnel" title="Cloudflare tunnel">
          <div className="flex items-start gap-14px mb-20px">
            <div className="size-40px rd-10px bg-2 border border-b-base flex-center text-t-secondary">
              <LinkCloud theme="outline" size="20" fill="currentColor" strokeWidth={3} />
            </div>
            <div>
              <div className="text-16px font-600 text-t-primary mb-4px">Cloudflare Tunnel</div>
              <div className="text-13px text-t-secondary leading-relaxed">
                Expose a local Pinforge API over HTTPS so online chatbot agents can request downloads
                and receive files. Requires{" "}
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

          <div className="bg-2 border border-b-base rd-12px p-18px flex flex-col gap-16px">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-14px text-t-primary">Enable tunnel</div>
                <div className="text-12px text-t-tertiary">
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
                </div>
              </div>
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
            </div>

            <div>
              <div className="text-12px text-t-tertiary mb-6px">Tunnel token</div>
              <Input.Password
                placeholder="Cloudflare tunnel token"
                value={tunnel.token}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, token: v } })}
                onBlur={() => void saveTunnel({ token: tunnel.token })}
              />
            </div>

            <div>
              <div className="text-12px text-t-tertiary mb-6px">Public hostname</div>
              <Input
                placeholder="pinforge.example.com"
                value={tunnel.hostname}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, hostname: v } })}
                onBlur={() => void saveTunnel({ hostname: tunnel.hostname })}
              />
            </div>

            <div>
              <div className="text-12px text-t-tertiary mb-6px">Local API port</div>
              <InputNumber
                className="w-full"
                min={1024}
                max={65535}
                value={tunnel.localPort}
                onChange={(v) => {
                  const port = Number(v) || 8787;
                  setRemote({ ...remote, tunnel: { ...tunnel, localPort: port } });
                  void saveTunnel({ localPort: port });
                }}
              />
            </div>

            <div>
              <div className="text-12px text-t-tertiary mb-6px">cloudflared path (optional)</div>
              <Input
                placeholder="Leave empty to use PATH"
                value={tunnel.binaryPath}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, binaryPath: v } })}
                onBlur={() => void saveTunnel({ binaryPath: tunnel.binaryPath })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-14px text-t-primary">Allow file send-back over tunnel</div>
                <div className="text-12px text-t-tertiary">
                  Bots can fetch completed download packs via the public URL
                </div>
              </div>
              <Switch
                checked={tunnel.allowFileSendBack}
                disabled={saving}
                onChange={(v) => void saveTunnel({ allowFileSendBack: v })}
              />
            </div>

            {tunnel.publicUrl && (
              <div className="text-12px text-t-secondary break-all">
                Public URL: {tunnel.publicUrl}
              </div>
            )}
            {tunnel.lastError && (
              <div className="text-12px" style={{ color: "var(--warning)" }}>
                {tunnel.lastError}
              </div>
            )}
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default RemoteSettings;

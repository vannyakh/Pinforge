import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Collapse,
  Input,
  InputNumber,
  Message,
  Select,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "@arco-design/web-react";
import { Communication, Delete, Info } from "@icon-park/react";
import {
  api,
  type CloudflareTunnelConfig,
  type RemoteBotOptions,
  type RemoteChannelConfig,
  type RemoteConfig,
  type RemoteRuntimeStatus,
  type RemoteUser,
  type RemoteUserStatus,
} from "@renderer/api";
import telegramLogo from "@renderer/assets/channel-logos/telegram.svg";
import discordLogo from "@renderer/assets/channel-logos/discord.svg";
import cloudflareLogo from "@renderer/assets/channel-logos/cloudflare.svg";
import {
  SettingsHeader,
  SettingsLoading,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "./components/SettingsLayout";

const CHANNEL_LOGOS: Record<string, { src: string; alt: string }> = {
  telegram: { src: telegramLogo, alt: "Telegram" },
  discord: { src: discordLogo, alt: "Discord" },
};

const CHANNEL_TAB_LOGOS = [
  { src: telegramLogo, alt: "Telegram" },
  { src: discordLogo, alt: "Discord" },
] as const;

function channelKey(id: string): string {
  return id;
}

function userLabel(user: RemoteUser): string {
  if (user.displayName?.trim()) return user.displayName.trim();
  if (user.username?.trim()) return `@${user.username.replace(/^@/, "")}`;
  return user.externalId || user.id;
}

function statusColor(status: RemoteUserStatus): string {
  if (status === "approved") return "green";
  if (status === "denied") return "red";
  return "orangered";
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

const LabelWithHelp: React.FC<{
  label: string;
  hint: React.ReactNode;
  ariaLabel?: string;
}> = ({ label, hint, ariaLabel = "Help" }) => (
  <span className="inline-flex items-center gap-6px">
    {label}
    <Tooltip content={hint}>
      <span className="remote-label-help" tabIndex={0} aria-label={ariaLabel}>
        <Info theme="outline" size="14" fill="currentColor" />
      </span>
    </Tooltip>
  </span>
);

const ChannelUserAccess: React.FC<{
  channelId: string;
  users: RemoteUser[];
  busyId: string | null;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onRemove: (id: string) => void;
}> = ({ channelId, users, busyId, onApprove, onDeny, onRemove }) => {
  const channelUsers = useMemo(
    () =>
      users
        .filter((u) => String(u.channel) === String(channelId))
        .sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0)),
    [users, channelId]
  );

  return (
    <div className="remote-user-access mt-10px pt-12px border-t border-b-base">
      <div className="text-14px text-t-primary mb-8px">User access</div>
      {channelUsers.length === 0 ? (
        <div className="text-12px text-t-tertiary py-6px">
          No users yet. They appear here after messaging the bot with /start.
        </div>
      ) : (
        <div className="remote-user-list flex flex-col gap-6px">
          {channelUsers.map((user) => {
            const busy = busyId === user.id;
            return (
              <div key={user.id} className="remote-user-row">
                <div className="remote-user-row__meta min-w-0">
                  <div className="text-13px text-t-primary truncate">{userLabel(user)}</div>
                  <div className="text-11px text-t-tertiary truncate">
                    {user.externalId}
                    {user.username ? ` · @${user.username.replace(/^@/, "")}` : ""}
                  </div>
                </div>
                <Tag size="small" color={statusColor(user.status)} className="shrink-0 capitalize">
                  {user.status}
                </Tag>
                <div className="remote-user-row__actions shrink-0 flex items-center gap-6px">
                  {user.status !== "approved" && (
                    <Button
                      size="mini"
                      type="primary"
                      loading={busy}
                      disabled={busy}
                      onClick={() => onApprove(user.id)}
                    >
                      Approve
                    </Button>
                  )}
                  {user.status !== "denied" && (
                    <Button
                      size="mini"
                      status="warning"
                      loading={busy}
                      disabled={busy}
                      onClick={() => onDeny(user.id)}
                    >
                      Deny
                    </Button>
                  )}
                  <Button
                    size="mini"
                    status="danger"
                    type="outline"
                    icon={<Delete theme="outline" size="12" fill="currentColor" />}
                    loading={busy}
                    disabled={busy}
                    onClick={() => onRemove(user.id)}
                    aria-label="Remove user"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

type ChannelFormProps = {
  channel: RemoteChannelConfig;
  saving: boolean;
  users: RemoteUser[];
  userBusyId: string | null;
  onLocalChange: (patch: Partial<RemoteChannelConfig>) => void;
  onSave: (channel: RemoteChannelConfig) => Promise<void>;
  onApproveUser: (id: string) => void;
  onDenyUser: (id: string) => void;
  onRemoveUser: (id: string) => void;
};

const ChannelConfigForm: React.FC<ChannelFormProps> = ({
  channel,
  saving,
  users,
  userBusyId,
  onLocalChange,
  onSave,
  onApproveUser,
  onDenyUser,
  onRemoveUser,
}) => {
  const [testing, setTesting] = useState(false);
  const key = channelKey(String(channel.id));
  const isTelegram = key === "telegram";
  const isDiscord = key === "discord";
  const canTest = isTelegram || isDiscord;
  const supportsUserAccess = isTelegram;

  const botOptions = channel.botOptions ?? {};

  const persist = async (patch: Partial<RemoteChannelConfig>) => {
    const next = { ...channel, ...patch };
    onLocalChange(patch);
    await onSave(next);
  };

  const persistBot = async (patch: Partial<RemoteBotOptions>) => {
    const nextBot = { ...botOptions, ...patch };
    await persist({ botOptions: nextBot });
  };

  const patchBotLocal = (patch: Partial<RemoteBotOptions>) => {
    onLocalChange({ botOptions: { ...botOptions, ...patch } });
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
        This platform integration is not available yet.
      </div>
    );
  }

  return (
    <div className="remote-channel-form flex flex-col gap-4px">
      {isTelegram && (
        <SettingsRow
          title={
            <LabelWithHelp
              label="Bot Token"
              ariaLabel="How to get a bot token"
              hint={
                <>
                  Open Telegram, find <code>@BotFather</code> and send <code>/newbot</code> to get
                  your Bot Token.
                </>
              }
            />
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
        </SettingsRow>
      )}

      {isDiscord && (
        <>
          <SettingsRow title="Bot Token">
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
          </SettingsRow>
          <SettingsRow title="Webhook URL">
            <Input
              style={{ width: 320 }}
              placeholder="https://discord.com/api/webhooks/…"
              value={channel.webhookUrl ?? ""}
              onChange={(v) => onLocalChange({ webhookUrl: v })}
              onBlur={() => void onSave(channel)}
            />
          </SettingsRow>
        </>
      )}

      {isTelegram && (
        <>
          <SettingsRow
            title={
              <LabelWithHelp
                label="Require approval"
                hint="New users must be approved before they can download."
              />
            }
          >
            <Switch
              checked={channel.requireApproval !== false}
              disabled={saving}
              onChange={(v) => void persist({ requireApproval: v })}
            />
          </SettingsRow>

          <SettingsRow
            title={
              <LabelWithHelp
                label="Admin chat ID"
                hint="Telegram group/channel ID where access requests are posted."
              />
            }
          >
            <Input
              style={{ width: 220 }}
              placeholder="-100…"
              value={botOptions.adminChatId ?? ""}
              onChange={(v) => patchBotLocal({ adminChatId: v })}
              onBlur={() => void onSave(channel)}
            />
          </SettingsRow>

          <SettingsRow
            title={
              <LabelWithHelp
                label="Welcome message"
                hint="Sent on /start to approved users. Leave empty for the default."
              />
            }
          >
            <Input.TextArea
              style={{ width: 320 }}
              autoSize={{ minRows: 2, maxRows: 4 }}
              placeholder="Optional custom welcome…"
              value={botOptions.welcomeMessage ?? ""}
              onChange={(v) => patchBotLocal({ welcomeMessage: v })}
              onBlur={() => void onSave(channel)}
            />
          </SettingsRow>

          <div className="remote-bot-section mt-6px pt-10px border-t border-b-base">
            <div className="text-14px text-t-primary mb-8px">
              <LabelWithHelp
                label="Download reply options"
                hint="How the bot handles pasted links and what it replies when a download finishes."
              />
            </div>

            <SettingsRow
              title={
                <LabelWithHelp
                  label="When a link is sent"
                  hint="Immediate starts now; queue adds to Tasks for later."
                />
              }
            >
              <Select
                style={{ width: 180 }}
                value={botOptions.downloadMode === "queue" ? "queue" : "immediate"}
                disabled={saving}
                onChange={(v) =>
                  void persistBot({ downloadMode: v === "queue" ? "queue" : "immediate" })
                }
              >
                <Select.Option value="immediate">Download now</Select.Option>
                <Select.Option value="queue">Add to queue</Select.Option>
              </Select>
            </SettingsRow>

            <SettingsRow
              title={
                <LabelWithHelp
                  label="Confirm before download"
                  hint="Show Download / Queue / Cancel buttons when a link is pasted."
                />
              }
            >
              <Switch
                checked={botOptions.confirmBeforeDownload !== false}
                disabled={saving}
                onChange={(v) => void persistBot({ confirmBeforeDownload: v })}
              />
            </SettingsRow>

            <SettingsRow
              title={
                <LabelWithHelp
                  label="Quality & format menu"
                  hint="Let users pick YouTube quality and Best/MP4/Audio before starting."
                />
              }
            >
              <Switch
                checked={botOptions.allowQualitySelect !== false}
                disabled={saving}
                onChange={(v) => void persistBot({ allowQualitySelect: v })}
              />
            </SettingsRow>

            <SettingsRow
              title={
                <LabelWithHelp
                  label="Detect before download"
                  hint="Reply with the matched provider before starting."
                />
              }
            >
              <Switch
                checked={botOptions.detectBeforeDownload !== false}
                disabled={saving}
                onChange={(v) => void persistBot({ detectBeforeDownload: v })}
              />
            </SettingsRow>

            <SettingsRow
              title={
                <LabelWithHelp
                  label="Max URLs per message"
                  hint="How many links to process from one chat message (1–10)."
                />
              }
            >
              <InputNumber
                style={{ width: 100 }}
                min={1}
                max={10}
                value={botOptions.maxUrlsPerMessage ?? 3}
                disabled={saving}
                onChange={(v) => {
                  const n = typeof v === "number" ? v : 3;
                  patchBotLocal({ maxUrlsPerMessage: Math.max(1, Math.min(10, n)) });
                }}
                onBlur={() => void onSave(channel)}
              />
            </SettingsRow>

            <SettingsRow
              title={
                <LabelWithHelp
                  label="Notify when done"
                  hint="Send a text message when the download finishes or fails."
                />
              }
            >
              <Switch
                checked={botOptions.notifyOnComplete !== false}
                disabled={saving}
                onChange={(v) => void persistBot({ notifyOnComplete: v })}
              />
            </SettingsRow>

            <SettingsRow
              title={
                <LabelWithHelp
                  label="Send file when done"
                  hint="Upload the downloaded file back to the chat (Telegram size limits apply)."
                />
              }
            >
              <Switch
                checked={channel.sendFilesBack}
                disabled={saving}
                onChange={(v) => void persist({ sendFilesBack: v })}
              />
            </SettingsRow>
          </div>
        </>
      )}

      {!isTelegram && (
        <SettingsRow title="Send files back to bot">
          <Switch
            checked={channel.sendFilesBack}
            disabled={saving}
            onChange={(v) => void persist({ sendFilesBack: v })}
          />
        </SettingsRow>
      )}

      {supportsUserAccess && (
        <ChannelUserAccess
          channelId={String(channel.id)}
          users={users}
          busyId={userBusyId}
          onApprove={onApproveUser}
          onDeny={onDenyUser}
          onRemove={onRemoveUser}
        />
      )}
    </div>
  );
};

const ChannelMenuItem: React.FC<{
  channel: RemoteChannelConfig;
  open: boolean;
  saving: boolean;
  runtime?: RemoteRuntimeStatus;
  users: RemoteUser[];
  userBusyId: string | null;
  onToggleOpen: () => void;
  onLocalChange: (patch: Partial<RemoteChannelConfig>) => void;
  onSave: (channel: RemoteChannelConfig) => Promise<void>;
  onApproveUser: (id: string) => void;
  onDenyUser: (id: string) => void;
  onRemoveUser: (id: string) => void;
}> = ({
  channel,
  open,
  saving,
  runtime,
  users,
  userBusyId,
  onToggleOpen,
  onLocalChange,
  onSave,
  onApproveUser,
  onDenyUser,
  onRemoveUser,
}) => {
  const key = channelKey(String(channel.id));
  const tgRunning = key === "telegram" && runtime?.telegram.running;
  const tgError = key === "telegram" ? runtime?.telegram.error : undefined;
  const pendingCount = users.filter(
    (u) => String(u.channel) === String(channel.id) && u.status === "pending"
  ).length;

  return (
    <div className="remote-channel-card" data-channel-id={channel.id}>
      <Collapse
        bordered={false}
        activeKey={open ? ["body"] : []}
        onChange={() => {
          if (!channel.available) return;
          onToggleOpen();
        }}
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
                {channel.enabled && key === "telegram" && (
                  <Tag size="small" color={tgRunning ? "green" : tgError ? "red" : "gray"}>
                    {tgRunning
                      ? runtime?.telegram.username
                        ? `@${runtime.telegram.username}`
                        : "Running"
                      : tgError
                        ? "Error"
                        : "Starting…"}
                  </Tag>
                )}
                {pendingCount > 0 && (
                  <Tag size="small" color="orangered">
                    {pendingCount} pending
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
            users={users}
            userBusyId={userBusyId}
            onLocalChange={onLocalChange}
            onSave={onSave}
            onApproveUser={onApproveUser}
            onDenyUser={onDenyUser}
            onRemoveUser={onRemoveUser}
          />
        </Collapse.Item>
      </Collapse>
    </div>
  );
};

const RemoteSettings: React.FC = () => {
  const [remote, setRemote] = useState<RemoteConfig | null>(null);
  const [runtime, setRuntime] = useState<RemoteRuntimeStatus | null>(null);
  const [users, setUsers] = useState<RemoteUser[]>([]);
  const [userBusyId, setUserBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("tunnel");
  const [openId, setOpenId] = useState<string | null>("telegram");

  const load = useCallback(async () => {
    const [r, rt, u] = await Promise.all([
      api.getRemote(),
      api.getRemoteRuntimeStatus(),
      api.listRemoteUsers(),
    ]);
    setRemote(r);
    setRuntime(rt);
    setUsers(u);
  }, []);

  useEffect(() => {
    load().catch((e) => Message.error(e instanceof Error ? e.message : String(e)));
    const offRuntime = api.onRemoteRuntimeChanged((next) => setRuntime(next));
    const offUsers = api.onRemoteUsersChanged((next) => setUsers(next));
    return () => {
      offRuntime();
      offUsers();
    };
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

  const setUserStatus = async (id: string, status: "approved" | "denied") => {
    setUserBusyId(id);
    try {
      const next = await api.setRemoteUserStatus({ id, status });
      setUsers(next);
      Message.success(status === "approved" ? "User approved" : "User denied");
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUserBusyId(null);
    }
  };

  const removeUser = async (id: string) => {
    setUserBusyId(id);
    try {
      const next = await api.removeRemoteUser(id);
      setUsers(next);
      Message.success("User removed");
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUserBusyId(null);
    }
  };

  if (!remote) {
    return <SettingsLoading label="Loading remote settings…" />;
  }

  const tunnel = remote.tunnel;

  return (
    <SettingsPage width="wide" className="remote-page">
      <SettingsHeader
        title="Remote"
        description="Connect chatbot agents online and expose media for Facebook publishing. Use a Cloudflare tunnel so bots and Meta can reach this app over HTTPS."
      />

      <Tabs activeTab={tab} onChange={setTab} type="line" className="settings-remote-tabs">
        <Tabs.TabPane
          key="tunnel"
          title={
            <span
              className={`remote-tab-label inline-flex items-center gap-6px ${
                tab === "tunnel" ? "text-t-primary font-600" : "text-t-secondary"
              }`}
            >
              <img
                className="remote-tab-logo"
                src={cloudflareLogo}
                alt=""
                width={15}
                height={15}
                draggable={false}
              />
              <span>Cloudflare Tunnel</span>
            </span>
          }
        >
          <SettingsSection>
            <SettingsRow title="Enable tunnel">
              <Switch
                checked={tunnel.enabled}
                disabled={saving}
                onChange={(v) => void saveTunnel({ enabled: v })}
              />
            </SettingsRow>

            <SettingsRow title="Tunnel token">
              <Input.Password
                style={{ width: 320 }}
                placeholder="eyJhIjoi…"
                value={tunnel.token}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, token: v } })}
                onBlur={() => void saveTunnel({ token: tunnel.token })}
              />
            </SettingsRow>

            <SettingsRow title="Hostname">
              <Input
                style={{ width: 260 }}
                placeholder="pinforge.example.com"
                value={tunnel.hostname}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, hostname: v } })}
                onBlur={() => void saveTunnel({ hostname: tunnel.hostname })}
              />
            </SettingsRow>

            <SettingsRow title="Local port">
              <InputNumber
                style={{ width: 120 }}
                min={1}
                max={65535}
                value={tunnel.localPort}
                onChange={(v) => {
                  const n = typeof v === "number" ? v : tunnel.localPort;
                  setRemote({ ...remote, tunnel: { ...tunnel, localPort: n } });
                }}
                onBlur={() => void saveTunnel({ localPort: tunnel.localPort })}
              />
            </SettingsRow>

            <SettingsRow title="cloudflared path">
              <Input
                style={{ width: 320 }}
                placeholder="Leave empty to use PATH"
                value={tunnel.binaryPath}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, binaryPath: v } })}
                onBlur={() => void saveTunnel({ binaryPath: tunnel.binaryPath })}
              />
            </SettingsRow>

            <SettingsRow title="Allow file send-back over tunnel">
              <Switch
                checked={tunnel.allowFileSendBack}
                disabled={saving}
                onChange={(v) => void saveTunnel({ allowFileSendBack: v })}
              />
            </SettingsRow>

            {tunnel.publicUrl && (
              <div className="text-12px text-t-secondary break-all pt-8px">
                Public URL: {tunnel.publicUrl}
              </div>
            )}
            {runtime?.tunnel.publicUrl && runtime.tunnel.publicUrl !== tunnel.publicUrl && (
              <div className="text-12px text-t-secondary break-all pt-8px">
                Live tunnel URL: {runtime.tunnel.publicUrl}
              </div>
            )}
            {tunnel.lastError && (
              <div className="settings-field">
                <Typography.Text type="warning" style={{ fontSize: 12 }}>
                  {tunnel.lastError}
                </Typography.Text>
              </div>
            )}
          </SettingsSection>
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
          <div className="remote-channel-menu flex flex-col gap-10px">
            {remote.channels.map((ch) => (
              <ChannelMenuItem
                key={ch.id}
                channel={ch}
                open={openId === ch.id}
                saving={saving}
                runtime={runtime ?? undefined}
                users={users}
                userBusyId={userBusyId}
                onToggleOpen={() => setOpenId((cur) => (cur === ch.id ? null : ch.id))}
                onLocalChange={(patch) => patchChannelLocal(ch.id, patch)}
                onSave={saveChannel}
                onApproveUser={(id) => void setUserStatus(id, "approved")}
                onDenyUser={(id) => void setUserStatus(id, "denied")}
                onRemoveUser={(id) => void removeUser(id)}
              />
            ))}
          </div>
        </Tabs.TabPane>
      </Tabs>
    </SettingsPage>
  );
};

export default RemoteSettings;

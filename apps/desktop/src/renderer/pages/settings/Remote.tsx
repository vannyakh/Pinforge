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

const PreferenceRow: React.FC<{
  label: React.ReactNode;
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
  const isWebhook = key === "webhook";
  const canTest = isTelegram || isDiscord || isWebhook;
  const supportsUserAccess = isTelegram || isDiscord;

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
        <PreferenceRow
          label={
            <span className="inline-flex items-center gap-6px">
              Bot Token
              <Tooltip
                content={
                  <>
                    Open Telegram, find <code>@BotFather</code> and send <code>/newbot</code> to get
                    your Bot Token.
                  </>
                }
              >
                <span className="remote-label-help" tabIndex={0} aria-label="How to get a bot token">
                  <Info theme="outline" size="14" fill="currentColor" />
                </span>
              </Tooltip>
            </span>
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
          <PreferenceRow label="Bot Token">
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
          <PreferenceRow label="Webhook URL">
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
          <PreferenceRow label="Display name">
            <Input
              style={{ width: 260 }}
              placeholder="Custom agent"
              value={channel.label}
              onChange={(v) => onLocalChange({ label: v })}
              onBlur={() => void onSave({ ...channel })}
            />
          </PreferenceRow>
          <PreferenceRow label="Webhook URL">
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
        </>
      )}

      {isTelegram && (
        <>
          <PreferenceRow
            label="Require approval"
            description="New users must be approved before they can download."
          >
            <Switch
              checked={channel.requireApproval !== false}
              disabled={saving}
              onChange={(v) => void persist({ requireApproval: v })}
            />
          </PreferenceRow>

          <PreferenceRow
            label="Admin chat ID"
            description="Telegram group/channel ID where access requests are posted."
          >
            <Input
              style={{ width: 220 }}
              placeholder="-100…"
              value={botOptions.adminChatId ?? ""}
              onChange={(v) => patchBotLocal({ adminChatId: v })}
              onBlur={() => void onSave(channel)}
            />
          </PreferenceRow>

          <PreferenceRow
            label="Welcome message"
            description="Sent on /start to approved users. Leave empty for the default."
          >
            <Input.TextArea
              style={{ width: 320 }}
              autoSize={{ minRows: 2, maxRows: 4 }}
              placeholder="Optional custom welcome…"
              value={botOptions.welcomeMessage ?? ""}
              onChange={(v) => patchBotLocal({ welcomeMessage: v })}
              onBlur={() => void onSave(channel)}
            />
          </PreferenceRow>

          <div className="remote-bot-section mt-6px pt-10px border-t border-b-base">
            <div className="text-14px text-t-primary mb-2px">Download reply options</div>
            <div className="text-12px text-t-tertiary mb-8px leading-relaxed">
              How the bot handles pasted links and what it replies when a download finishes.
            </div>

            <PreferenceRow
              label="When a link is sent"
              description="Immediate starts now; queue adds to Tasks for later."
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
            </PreferenceRow>

            <PreferenceRow
              label="Confirm before download"
              description="Show Download / Queue / Cancel buttons when a link is pasted."
            >
              <Switch
                checked={botOptions.confirmBeforeDownload !== false}
                disabled={saving}
                onChange={(v) => void persistBot({ confirmBeforeDownload: v })}
              />
            </PreferenceRow>

            <PreferenceRow
              label="Quality & format menu"
              description="Let users pick YouTube quality and Best/MP4/Audio before starting."
            >
              <Switch
                checked={botOptions.allowQualitySelect !== false}
                disabled={saving}
                onChange={(v) => void persistBot({ allowQualitySelect: v })}
              />
            </PreferenceRow>

            <PreferenceRow
              label="Detect before download"
              description="Reply with the matched provider before starting."
            >
              <Switch
                checked={botOptions.detectBeforeDownload !== false}
                disabled={saving}
                onChange={(v) => void persistBot({ detectBeforeDownload: v })}
              />
            </PreferenceRow>

            <PreferenceRow
              label="Max URLs per message"
              description="How many links to process from one chat message (1–10)."
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
            </PreferenceRow>

            <PreferenceRow
              label="Notify when done"
              description="Send a text message when the download finishes or fails."
            >
              <Switch
                checked={botOptions.notifyOnComplete !== false}
                disabled={saving}
                onChange={(v) => void persistBot({ notifyOnComplete: v })}
              />
            </PreferenceRow>

            <PreferenceRow
              label="Send file when done"
              description="Upload the downloaded file back to the chat (Telegram size limits apply)."
            >
              <Switch
                checked={channel.sendFilesBack}
                disabled={saving}
                onChange={(v) => void persist({ sendFilesBack: v })}
              />
            </PreferenceRow>
          </div>
        </>
      )}

      {!isTelegram && (
        <PreferenceRow label="Send files back to bot">
          <Switch
            checked={channel.sendFilesBack}
            disabled={saving}
            onChange={(v) => void persist({ sendFilesBack: v })}
          />
        </PreferenceRow>
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
          <div className="bg-2 rd-12px border border-b-base px-18px py-4px mb-16px">
            <PreferenceRow label="Enable tunnel">
              <Switch
                checked={tunnel.enabled}
                disabled={saving}
                onChange={(v) => void saveTunnel({ enabled: v })}
              />
            </PreferenceRow>

            <PreferenceRow label="Tunnel token">
              <Input.Password
                style={{ width: 320 }}
                placeholder="eyJhIjoi…"
                value={tunnel.token}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, token: v } })}
                onBlur={() => void saveTunnel({ token: tunnel.token })}
              />
            </PreferenceRow>

            <PreferenceRow label="Hostname">
              <Input
                style={{ width: 260 }}
                placeholder="pinforge.example.com"
                value={tunnel.hostname}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, hostname: v } })}
                onBlur={() => void saveTunnel({ hostname: tunnel.hostname })}
              />
            </PreferenceRow>

            <PreferenceRow label="Local port">
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
            </PreferenceRow>

            <PreferenceRow label="cloudflared path">
              <Input
                style={{ width: 320 }}
                placeholder="Leave empty to use PATH"
                value={tunnel.binaryPath}
                onChange={(v) => setRemote({ ...remote, tunnel: { ...tunnel, binaryPath: v } })}
                onBlur={() => void saveTunnel({ binaryPath: tunnel.binaryPath })}
              />
            </PreferenceRow>

            <PreferenceRow label="Allow file send-back over tunnel">
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
            {runtime?.tunnel.publicUrl && runtime.tunnel.publicUrl !== tunnel.publicUrl && (
              <div className="text-12px text-t-secondary break-all pt-8px">
                Live tunnel URL: {runtime.tunnel.publicUrl}
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
    </div>
  );
};

export default RemoteSettings;

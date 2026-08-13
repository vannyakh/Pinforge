import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Input,
  Message,
  Select,
  Tag,
  Tooltip,
  Typography,
} from "@arco-design/web-react";
import type { Dayjs } from "dayjs";
import { Info, LinkCloud, UploadOne } from "@icon-park/react";
import {
  api,
  type YouTubeChannelSummary,
  type YouTubePublishPublic,
  type YouTubePublishTimingMode,
} from "@renderer/api";
import PublishSchedulePicker from "@renderer/components/publish/PublishSchedulePicker";
import {
  buildPublishTiming,
  defaultScheduleDayjs,
  YOUTUBE_MIN_SCHEDULE_LEAD_MS,
} from "@renderer/components/publish/publishSchedule";
import youtubeLogo from "@renderer/assets/provider-logos/youtube.svg";
import { DEFAULT_YOUTUBE_REDIRECT_URI } from "@common/publish/types";
import {
  SettingsField,
  SettingsLoading,
  SettingsRow,
  SettingsSection,
  SettingsSectionFooter,
} from "./components/SettingsLayout";

const LabelWithHelp: React.FC<{
  label: string;
  hint: React.ReactNode;
}> = ({ label, hint }) => (
  <span className="inline-flex items-center gap-6px">
    {label}
    <Tooltip content={hint}>
      <span className="remote-label-help" tabIndex={0} aria-label="Help">
        <Info theme="outline" size="14" fill="currentColor" />
      </span>
    </Tooltip>
  </span>
);

function formatExpiry(ts?: number): string | null {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

const YouTubePublishSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [publicConfig, setPublicConfig] = useState<YouTubePublishPublic | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(DEFAULT_YOUTUBE_REDIRECT_URI);
  const [channels, setChannels] = useState<YouTubeChannelSummary[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadPrivacy, setUploadPrivacy] = useState<"public" | "private" | "unlisted">("private");
  const [uploadFilePath, setUploadFilePath] = useState("");
  const [timingMode, setTimingMode] = useState<YouTubePublishTimingMode>("now");
  const [scheduleValue, setScheduleValue] = useState<Dayjs | undefined>(() =>
    defaultScheduleDayjs(YOUTUBE_MIN_SCHEDULE_LEAD_MS)
  );
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const cfg = await api.getYouTubePublish();
    setPublicConfig(cfg);
    setClientId(cfg.clientId);
    setRedirectUri(cfg.redirectUri || DEFAULT_YOUTUBE_REDIRECT_URI);
    setSelectedChannelId(cfg.channelId ?? "");
    setClientSecret("");
    if (cfg.connected) {
      try {
        const list = await api.listYouTubeChannels();
        setChannels(list);
      } catch {
        /* optional on refresh */
      }
    } else {
      setChannels([]);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const channelOptions = useMemo(
    () => channels.map((c) => ({ label: c.title, value: c.id })),
    [channels]
  );

  const saveApp = async () => {
    setBusy("save-app");
    try {
      const next = await api.setYouTubeApp({ clientId, clientSecret, redirectUri });
      setPublicConfig(next);
      setClientSecret("");
      Message.success("Google OAuth client saved.");
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    setBusy("connect");
    try {
      const result = await api.startYouTubeConnect();
      if (!result.ok) {
        Message.error(result.message);
        return;
      }
      Message.success(result.message);
      await refresh();
      await loadChannels();
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      const next = await api.disconnectYouTubePublish();
      setPublicConfig(next);
      setChannels([]);
      setSelectedChannelId("");
      Message.info("YouTube account disconnected.");
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const loadChannels = async () => {
    setBusy("channels");
    try {
      const list = await api.listYouTubeChannels();
      setChannels(list);
      if (list.length === 0) {
        Message.warning("No YouTube channels found for this account.");
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const selectChannel = async (channelId: string) => {
    setSelectedChannelId(channelId);
    if (!channelId) return;
    setBusy("select-channel");
    try {
      const channel = channels.find((c) => c.id === channelId);
      const next = await api.selectYouTubeChannel({
        channelId,
        channelTitle: channel?.title,
        channelThumbnailUrl: channel?.thumbnailUrl,
      });
      setPublicConfig(next);
      Message.success(`Uploading as ${next.channelTitle ?? "channel"}.`);
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const pickVideo = async () => {
    const path = await api.pickMediaFile();
    if (path) setUploadFilePath(path);
  };

  const testUpload = async () => {
    setBusy("upload");
    try {
      const result = await api.uploadToYouTube({
        title: uploadTitle,
        description: uploadDescription.trim() || undefined,
        tags: uploadTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        privacyStatus: uploadPrivacy,
        filePath: uploadFilePath.trim(),
        timing: buildPublishTiming(timingMode, scheduleValue),
      });
      if (!result.ok) {
        Message.error(result.message);
        return;
      }
      Message.success(result.videoId ? `${result.message} (ID: ${result.videoId})` : result.message);
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const openGoogleCloud = () => {
    void api.openExternal("https://console.cloud.google.com/apis/credentials");
  };

  if (loading || !publicConfig) {
    return <SettingsLoading label="Loading YouTube settings…" />;
  }

  const tokenExpiry = formatExpiry(publicConfig.tokenExpiresAt);

  return (
    <>
      <SettingsSection title="Developer App">
        <SettingsField
          title={
            <LabelWithHelp
              label="Client ID"
              hint="OAuth 2.0 Client ID from Google Cloud Console → APIs & Services → Credentials."
            />
          }
        >
          <Input value={clientId} onChange={setClientId} placeholder="1234567890.apps.googleusercontent.com" allowClear />
        </SettingsField>

        <SettingsField
          title={
            <LabelWithHelp
              label="Client secret"
              hint={
                publicConfig.hasClientSecret
                  ? "Leave blank to keep the saved secret. Enter a new value to replace it."
                  : "Stored locally on this device."
              }
            />
          }
        >
          <Input.Password
            value={clientSecret}
            onChange={setClientSecret}
            placeholder={publicConfig.hasClientSecret ? "••••••••••••••••" : "Client secret"}
          />
        </SettingsField>

        <SettingsField
          title={
            <LabelWithHelp
              label="OAuth redirect URI"
              hint={
                <>
                  Add this URI under Authorized redirect URIs for your OAuth client. Default uses
                  local loopback on port 8766.
                </>
              }
            />
          }
        >
          <Input
            value={redirectUri}
            onChange={setRedirectUri}
            placeholder={DEFAULT_YOUTUBE_REDIRECT_URI}
          />
        </SettingsField>

        <SettingsSectionFooter>
          <Button type="text" icon={<LinkCloud theme="outline" size="16" />} onClick={openGoogleCloud}>
            Google Cloud Console
          </Button>
          <Button type="primary" loading={busy === "save-app"} onClick={() => void saveApp()}>
            Save OAuth client
          </Button>
        </SettingsSectionFooter>
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRow
          title={
            <span className="inline-flex items-center gap-8px">
              <img src={youtubeLogo} alt="" className="remote-channel-logo" draggable={false} />
              Connection
            </span>
          }
          description={
            publicConfig.connected
              ? `Signed in${publicConfig.userName ? ` as ${publicConfig.userName}` : ""}.${tokenExpiry ? ` Token expires ${tokenExpiry}.` : ""}`
              : "Authorize Pinforge to upload videos to your YouTube channel."
          }
        >
          <div className="flex items-center gap-8px flex-wrap justify-end">
            {publicConfig.connected ? (
              <>
                <Tag color="green">Connected</Tag>
                <Button loading={busy === "disconnect"} onClick={() => void disconnect()}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                type="primary"
                loading={busy === "connect"}
                disabled={!publicConfig.clientId || !publicConfig.hasClientSecret}
                onClick={() => void connect()}
              >
                Connect YouTube
              </Button>
            )}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Channel">
        <SettingsRow
          title="Channel for uploads"
          description={
            publicConfig.hasChannel && publicConfig.channelTitle
              ? `Currently selected: ${publicConfig.channelTitle}`
              : "Choose the channel Pinforge uploads to."
          }
        >
          <div className="flex flex-col gap-8px items-stretch min-w-240px">
            <Select
              placeholder={publicConfig.connected ? "Select a channel" : "Connect YouTube first"}
              value={selectedChannelId || undefined}
              options={channelOptions}
              disabled={!publicConfig.connected || channels.length === 0}
              loading={busy === "select-channel"}
              onChange={(v) => void selectChannel(String(v))}
              allowClear
              onClear={() => setSelectedChannelId("")}
            />
            <Button
              size="small"
              loading={busy === "channels"}
              disabled={!publicConfig.connected}
              onClick={() => void loadChannels()}
            >
              Refresh channels
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Test upload">
        <SettingsField title="Title" description="Required for every YouTube upload.">
          <Input value={uploadTitle} onChange={setUploadTitle} placeholder="Video title" allowClear />
        </SettingsField>

        <SettingsField title="Description">
          <Input.TextArea
            value={uploadDescription}
            onChange={setUploadDescription}
            placeholder="Tell viewers about your video…"
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </SettingsField>

        <SettingsField title="Tags" description="Comma-separated. Up to 30 tags.">
          <Input value={uploadTags} onChange={setUploadTags} placeholder="tag one, tag two" allowClear />
        </SettingsField>

        <SettingsField title="Privacy">
          <Select
            value={uploadPrivacy}
            onChange={(v) => setUploadPrivacy(v as "public" | "private" | "unlisted")}
            options={[
              { label: "Private", value: "private" },
              { label: "Unlisted", value: "unlisted" },
              { label: "Public", value: "public" },
            ]}
          />
        </SettingsField>

        <SettingsField title="Video file">
          <div className="flex gap-8px">
            <Input
              value={uploadFilePath}
              onChange={setUploadFilePath}
              placeholder="Path to video file"
              className="flex-1"
            />
            <Button onClick={() => void pickVideo()}>Browse</Button>
          </div>
        </SettingsField>

        <SettingsField title="Timing">
          <PublishSchedulePicker
            mode={timingMode}
            onModeChange={setTimingMode}
            scheduleValue={scheduleValue}
            onScheduleChange={setScheduleValue}
            minLeadMs={YOUTUBE_MIN_SCHEDULE_LEAD_MS}
          />
        </SettingsField>

        <SettingsSectionFooter>
          <Button
            type="primary"
            icon={<UploadOne theme="outline" size="16" />}
            loading={busy === "upload"}
            disabled={!publicConfig.hasChannel}
            onClick={() => void testUpload()}
          >
            Upload test video
          </Button>
        </SettingsSectionFooter>
      </SettingsSection>
    </>
  );
};

export default YouTubePublishSettings;

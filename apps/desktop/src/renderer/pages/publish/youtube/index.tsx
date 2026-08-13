import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Empty,
  Input,
  Message,
  Select,
  Typography,
} from "@arco-design/web-react";
import type { Dayjs } from "dayjs";
import { UploadOne } from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type YouTubePublishPublic,
  type YouTubePublishTimingMode,
} from "@renderer/api";
import PublishSchedulePicker from "@renderer/components/publish/PublishSchedulePicker";
import {
  buildPublishTiming,
  defaultScheduleDayjs,
  YOUTUBE_MIN_SCHEDULE_LEAD_MS,
} from "@renderer/components/publish/publishSchedule";
import {
  SettingsField,
  SettingsHeader,
  SettingsLoading,
  SettingsPage,
  SettingsScrollShell,
  SettingsSection,
  SettingsSectionFooter,
} from "@renderer/pages/settings/components/SettingsLayout";

const YouTubePublishPage: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<YouTubePublishPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "private" | "unlisted">("private");
  const [filePath, setFilePath] = useState("");
  const [timingMode, setTimingMode] = useState<YouTubePublishTimingMode>("now");
  const [scheduleValue, setScheduleValue] = useState<Dayjs | undefined>(() =>
    defaultScheduleDayjs(YOUTUBE_MIN_SCHEDULE_LEAD_MS)
  );

  useEffect(() => {
    void api
      .getYouTubePublish()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }, []);

  const ready = useMemo(
    () => Boolean(title.trim() && filePath.trim() && config?.hasChannel),
    [title, filePath, config?.hasChannel]
  );

  const pickVideo = async () => {
    const path = await api.pickMediaFile();
    if (path) setFilePath(path);
  };

  const publish = async () => {
    if (!title.trim()) {
      Message.warning("Enter a title for your video.");
      return;
    }
    if (!filePath.trim()) {
      Message.warning("Choose a video file to upload.");
      return;
    }
    if (!config?.connected) {
      Message.warning("Connect YouTube in Publishing settings first.");
      void navigate("/settings/publishing");
      return;
    }
    if (!config.hasChannel) {
      Message.warning("Select a YouTube channel in Publishing settings first.");
      void navigate("/settings/publishing");
      return;
    }

    setBusy(true);
    try {
      const result = await api.uploadToYouTube({
        title: title.trim(),
        description: description.trim() || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        privacyStatus: privacy,
        filePath: filePath.trim(),
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
      setBusy(false);
    }
  };

  const openSettings = () => {
    void navigate("/settings/publishing");
  };

  const setupMessage = !config?.connected
    ? "Connect a Google OAuth client and YouTube account in Publishing settings before uploading."
    : "Select a YouTube channel in Publishing settings before uploading.";

  const showSetup = !loading && (!config?.connected || !config.hasChannel);

  return (
    <SettingsScrollShell className="publish-page">
      <SettingsPage width="wide">
        <SettingsHeader
          title="YouTube upload"
          description="Upload a video to your connected YouTube channel."
        />

        {loading ? (
          <SettingsLoading label="Loading YouTube settings…" />
        ) : showSetup ? (
          <div className="publish-setup-empty">
            <Empty description={
              <>
              <Typography.Text type="secondary">{setupMessage}</Typography.Text>
              <Button type="primary" onClick={openSettings} className="mt-8px">Open Publishing settings</Button>
              </>
            }  imgSrc='//p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/a0082b7754fbdb2d98a5c18d0b0edd25.png~tplv-uwbnlip3yd-webp.webp' 
            
            />
          
          </div>
        ) : config ? (
          <>
            {config.channelTitle ? (
              <Typography.Text type="secondary" className="block mb-12px">
                Uploading to <strong>{config.channelTitle}</strong>
              </Typography.Text>
            ) : null}

            <SettingsSection title="Video details">
              <SettingsField title="Title" description="Required.">
                <Input value={title} onChange={setTitle} placeholder="Video title" allowClear />
              </SettingsField>

              <SettingsField title="Description">
                <Input.TextArea
                  value={description}
                  onChange={setDescription}
                  placeholder="Tell viewers about your video…"
                  autoSize={{ minRows: 4, maxRows: 10 }}
                />
              </SettingsField>

              <SettingsField title="Tags" description="Comma-separated. Up to 30 tags.">
                <Input value={tags} onChange={setTags} placeholder="tag one, tag two" allowClear />
              </SettingsField>

              <SettingsField title="Privacy">
                <Select
                  value={privacy}
                  onChange={(v) => setPrivacy(v as "public" | "private" | "unlisted")}
                  options={[
                    { label: "Private", value: "private" },
                    { label: "Unlisted", value: "unlisted" },
                    { label: "Public", value: "public" },
                  ]}
                />
              </SettingsField>
            </SettingsSection>

            <SettingsSection title="Media">
              <SettingsField title="Video file">
                <div className="flex gap-8px">
                  <Input
                    value={filePath}
                    onChange={setFilePath}
                    placeholder="Path to MP4, MOV, WebM, or MKV"
                    className="flex-1"
                  />
                  <Button onClick={() => void pickVideo()}>Browse</Button>
                </div>
              </SettingsField>
            </SettingsSection>

            <SettingsSection title="Timing">
              <PublishSchedulePicker
                mode={timingMode}
                onModeChange={setTimingMode}
                scheduleValue={scheduleValue}
                onScheduleChange={setScheduleValue}
                minLeadMs={YOUTUBE_MIN_SCHEDULE_LEAD_MS}
              />

              <SettingsSectionFooter>
                <Button
                  type="primary"
                  icon={<UploadOne theme="outline" size="16" />}
                  loading={busy}
                  disabled={!ready}
                  onClick={() => void publish()}
                >
                  {timingMode === "schedule" ? "Schedule upload" : "Upload video"}
                </Button>
              </SettingsSectionFooter>
            </SettingsSection>
          </>
        ) : null}
      </SettingsPage>
    </SettingsScrollShell>
  );
};

export default YouTubePublishPage;

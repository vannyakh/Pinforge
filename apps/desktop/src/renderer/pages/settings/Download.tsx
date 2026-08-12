import React, { useMemo } from "react";
import { Button, Input, InputNumber, Select, Switch } from "@arco-design/web-react";
import { useApp } from "@renderer/hooks/context/AppContext";
import type { FormatPreset, PresetName, YoutubeQuality } from "@renderer/api";
import {
  DEFAULT_NAMING_TEMPLATES,
  NAMING_TEMPLATE_VARIABLES,
  renderNamingTemplate,
} from "@pinforge/core/types";
import {
  SettingsField,
  SettingsHeader,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "./components/SettingsLayout";

const NAMING_PREVIEW_VARS = {
  title: "My Video Title",
  id: "dQw4w9WgXcQ",
  provider: "youtube",
  channel: "Artist Name",
  ext: "mp4",
  date: "2024-06-01",
  quality: "1080",
  height: "1080",
  index: 1,
};

const FEATURE_ITEMS = [
  ["autoLevels", "Auto levels", "Balance brightness and contrast"],
  ["denoise", "Denoise", "Reduce noise and grain"],
  ["sharpen", "Sharpen", "Add edge clarity"],
  ["upscale", "Upscale 2×", "Enlarge stills before sharpening"],
  ["keepOriginal", "Keep original", "Save the source file next to the enhanced output"],
] as const;

const DownloadSettings: React.FC = () => {
  const { settings, updateSettings } = useApp();
  if (!settings) return null;

  const fileTemplate = settings.naming?.fileName ?? DEFAULT_NAMING_TEMPLATES.fileName;
  const folderTemplate = settings.naming?.folderName ?? DEFAULT_NAMING_TEMPLATES.folderName;

  const filePreview = useMemo(
    () => renderNamingTemplate(fileTemplate, NAMING_PREVIEW_VARS),
    [fileTemplate]
  );
  const folderPreview = useMemo(
    () => renderNamingTemplate(folderTemplate, NAMING_PREVIEW_VARS),
    [folderTemplate]
  );

  return (
    <SettingsPage width="narrow">
      <SettingsHeader
        title="Download"
        description="Defaults for downloads, enhance pipeline, and board processing."
      />
      <SettingsSection title="Enhance">
        <SettingsRow
          title="Enhance images"
          description="Apply image enhancement to Pinterest stills by default."
        >
          <Switch
            checked={settings.enhance}
            onChange={(v) => void updateSettings({ enhance: v })}
          />
        </SettingsRow>
        {settings.enhance && (
          <SettingsField
            title="Enhance features"
            description="Steps applied when enhance is on. Intensity still follows the preset."
          >
            <div className="flex flex-col gap-8px">
              {FEATURE_ITEMS.map(([key, title, desc]) => (
                <label key={key} className="flex items-start gap-10px cursor-pointer py-4px">
                  <Switch
                    size="small"
                    checked={Boolean(settings.enhanceFeatures?.[key])}
                    onChange={(v) => void updateSettings({ enhanceFeatures: { [key]: v } })}
                  />
                  <span className="min-w-0">
                    <span className="block text-13px text-t-primary">{title}</span>
                    <span className="block text-12px text-t-tertiary mt-2px">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </SettingsField>
        )}
        <SettingsField title="Enhance preset" description="Default quality pipeline for stills.">
          <Select
            className="w-full"
            value={settings.preset}
            onChange={(v) => void updateSettings({ preset: v as PresetName })}
          >
            {(Object.keys(settings.presets) as PresetName[]).map((key) => (
              <Select.Option key={key} value={key}>
                {settings.presets[key].label} — {settings.presets[key].description}
              </Select.Option>
            ))}
          </Select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Download defaults">
        <SettingsRow
          title="Auto download"
          description="Skip confirm and start processing after URL detection. Turn off to review options first."
        >
          <Switch
            checked={settings.autoDownload !== false}
            onChange={(v) => void updateSettings({ autoDownload: v })}
          />
        </SettingsRow>
        <SettingsRow
          title="Clipboard link grabber"
          description="While Pinforge is focused, copy a media URL and it is added to the Tasks queue automatically (JDownloader-style)."
        >
          <Switch
            checked={Boolean(settings.clipboardMonitor)}
            onChange={(v) => void updateSettings({ clipboardMonitor: v })}
          />
        </SettingsRow>
        <SettingsRow
          title="Grab links in background"
          description="When clipboard monitor is on, also capture URLs while Pinforge is unfocused and append them to the Tasks queue."
        >
          <Switch
            checked={Boolean(settings.clipboardMonitorBackground)}
            disabled={!settings.clipboardMonitor}
            onChange={(v) => void updateSettings({ clipboardMonitorBackground: v })}
          />
        </SettingsRow>
        <SettingsField
          title="Parallel downloads"
          description="How many pack-level downloads Tasks runs at once (1–3). Boards and playlists still download items inside each pack with their own concurrency."
        >
          <Select
            className="w-full"
            value={String(settings.maxParallelDownloads ?? 2)}
            onChange={(v) => void updateSettings({ maxParallelDownloads: Number(v) })}
          >
            <Select.Option value="1">1 — one at a time</Select.Option>
            <Select.Option value="2">2 — recommended</Select.Option>
            <Select.Option value="3">3 — fastest</Select.Option>
          </Select>
        </SettingsField>
        <SettingsRow
          title="Folder per download"
          description="Each download gets its own folder — videos with separate audio or subtitles, carousels, and multi-file posts stay grouped instead of loose in the download directory."
        >
          <Switch
            checked={settings.packFolders !== false}
            onChange={(v) => void updateSettings({ packFolders: v })}
          />
        </SettingsRow>
        <SettingsField
          title="File name template"
          description={
            "Output filename without extension. Use {key} placeholders — preview updates below."
          }
        >
          <Input
            className="w-full"
            value={fileTemplate}
            placeholder={DEFAULT_NAMING_TEMPLATES.fileName}
            onChange={(v) => void updateSettings({ naming: { fileName: v } })}
          />
          <div className="text-12px text-t-tertiary mt-6px font-mono">
            Preview: {filePreview}.mp4
          </div>
        </SettingsField>
        <SettingsField
          title="Folder name template"
          description={"Used when folder per download is on. Same {key} syntax as filenames."}
        >
          <Input
            className="w-full"
            value={folderTemplate}
            placeholder={DEFAULT_NAMING_TEMPLATES.folderName}
            onChange={(v) => void updateSettings({ naming: { folderName: v } })}
          />
          <div className="text-12px text-t-tertiary mt-6px font-mono">
            Preview: {folderPreview}/
          </div>
        </SettingsField>
        <SettingsField
          title="Template variables"
          description="Click to copy a placeholder into your template."
        >
          <div className="flex flex-wrap gap-6px">
            {NAMING_TEMPLATE_VARIABLES.map((v) => (
              <Button
                key={v.key}
                size="mini"
                type="outline"
                title={v.description}
                onClick={() => {
                  void navigator.clipboard.writeText(`{${v.key}}`).catch(() => undefined);
                }}
              >
                {`{${v.key}}`}
              </Button>
            ))}
          </div>
          <div className="mt-10px">
            <Button
              size="mini"
              type="text"
              onClick={() =>
                void updateSettings({
                  naming: {
                    fileName: DEFAULT_NAMING_TEMPLATES.fileName,
                    folderName: DEFAULT_NAMING_TEMPLATES.folderName,
                  },
                })
              }
            >
              Reset naming to default
            </Button>
          </div>
        </SettingsField>
        <SettingsField
          title="Default video format"
          description="YouTube / Instagram / TikTok output preference."
        >
          <Select
            className="w-full"
            value={settings.format}
            onChange={(v) => void updateSettings({ format: v as FormatPreset })}
          >
            <Select.Option value="best">best</Select.Option>
            <Select.Option value="mp4">mp4</Select.Option>
            <Select.Option value="audio-only">audio-only</Select.Option>
          </Select>
        </SettingsField>
        <SettingsField
          title="YouTube quality"
          description="Default max height for YouTube downloads (Best = highest available)."
        >
          <Select
            className="w-full"
            value={settings.youtube?.quality ?? "best"}
            onChange={(v) => void updateSettings({ youtube: { quality: v as YoutubeQuality } })}
          >
            {(["best", "2160", "1440", "1080", "720", "480", "360"] as YoutubeQuality[]).map(
              (q) => (
                <Select.Option key={q} value={q}>
                  {q === "best" ? "Best" : `${q}p`}
                </Select.Option>
              )
            )}
          </Select>
        </SettingsField>
        <SettingsField
          title="YouTube channel max videos"
          description="How many uploads to pull from a channel or @handle URL (1–500)."
        >
          <InputNumber
            className="w-full"
            min={1}
            max={500}
            step={10}
            value={settings.youtube?.channelMaxVideos ?? 50}
            onChange={(v) =>
              void updateSettings({
                youtube: { channelMaxVideos: Math.max(1, Math.min(500, Number(v) || 50)) },
              })
            }
          />
        </SettingsField>
        <SettingsField
          title="YouTube playlist max videos"
          description="How many videos to pull from a playlist or mix URL (1–500)."
        >
          <InputNumber
            className="w-full"
            min={1}
            max={500}
            step={10}
            value={settings.youtube?.playlistMaxVideos ?? 50}
            onChange={(v) =>
              void updateSettings({
                youtube: { playlistMaxVideos: Math.max(1, Math.min(500, Number(v) || 50)) },
              })
            }
          />
        </SettingsField>
        <SettingsRow
          title="Organize by channel"
          description="Save YouTube downloads under outDir / channel name."
        >
          <Switch
            checked={settings.youtube?.organizeByChannel !== false}
            onChange={(v) => void updateSettings({ youtube: { organizeByChannel: v } })}
          />
        </SettingsRow>
        <SettingsField
          title="Pinterest board max pins"
          description="How many pins to list/download from a board, profile, or search (1–2000)."
        >
          <InputNumber
            className="w-full"
            min={1}
            max={2000}
            step={25}
            value={settings.pinterest?.boardMaxPins ?? 200}
            onChange={(v) =>
              void updateSettings({
                pinterest: { boardMaxPins: Math.max(1, Math.min(2000, Number(v) || 200)) },
              })
            }
          />
        </SettingsField>
        <SettingsRow
          title="ZIP board downloads"
          description="After a board/profile batch finishes, create a .zip next to the folder."
        >
          <Switch
            checked={Boolean(settings.pinterest?.zipBoards)}
            onChange={(v) => void updateSettings({ pinterest: { zipBoards: v } })}
          />
        </SettingsRow>
        <SettingsField
          title="Pinterest cookies"
          description="Paste a Cookie header from your browser (DevTools → Network) to access private boards. Stored locally only."
        >
          <Input.TextArea
            className="w-full"
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder="_pinterest_sess=…; csrftoken=…"
            value={settings.pinterest?.cookies ?? ""}
            onChange={(v) => void updateSettings({ pinterest: { cookies: v } })}
          />
        </SettingsField>
        <SettingsField
          title="Board delay (ms)"
          description="Pause between board items to reduce rate limits."
        >
          <InputNumber
            className="w-full"
            min={500}
            max={10000}
            step={100}
            value={settings.delayMs}
            onChange={(v) => void updateSettings({ delayMs: Number(v) || 1500 })}
          />
        </SettingsField>
      </SettingsSection>
    </SettingsPage>
  );
};

export default DownloadSettings;

import React from "react";
import { Input, InputNumber, Select, Switch } from "@arco-design/web-react";
import { useApp } from "@renderer/hooks/context/AppContext";
import type { FormatPreset, PresetName, YoutubeQuality } from "@renderer/api";

const Row: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <div className="flex items-start justify-between gap-24px py-14px border-b border-b-base last:border-b-0">
    <div className="min-w-0 flex-1">
      <div className="text-14px text-t-primary">{title}</div>
      {description && (
        <div className="text-12px text-t-tertiary mt-4px leading-relaxed">{description}</div>
      )}
    </div>
    <div className="shrink-0 flex items-center">{children}</div>
  </div>
);

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

  return (
    <div className="max-w-640px w-full">
      <div className="text-22px font-600 text-t-primary mb-6px">Download</div>
      <div className="text-t-secondary text-14px mb-24px">
        Defaults for downloads, enhance pipeline, and board processing.
      </div>

      <div className="text-12px font-500 text-t-tertiary tracking-wide uppercase mb-8px">
        Enhance
      </div>
      <div className="bg-2 rd-12px border border-b-base px-18px mb-28px">
        <Row
          title="Enhance images"
          description="Apply image enhancement to Pinterest stills by default."
        >
          <Switch
            checked={settings.enhance}
            onChange={(v) => void updateSettings({ enhance: v })}
          />
        </Row>
        {settings.enhance && (
          <div className="py-14px border-b border-b-base">
            <div className="text-14px text-t-primary mb-4px">Enhance features</div>
            <div className="text-12px text-t-tertiary mb-10px">
              Steps applied when enhance is on. Intensity still follows the preset.
            </div>
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
          </div>
        )}
        <div className="py-14px">
          <div className="text-14px text-t-primary mb-4px">Enhance preset</div>
          <div className="text-12px text-t-tertiary mb-8px">
            Default quality pipeline for stills.
          </div>
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
        </div>
      </div>

      <div className="text-12px font-500 text-t-tertiary tracking-wide uppercase mb-8px">
        Download defaults
      </div>
      <div className="bg-2 rd-12px border border-b-base px-18px mb-16px">
        <Row
          title="Auto download"
          description="Skip confirm and start processing after URL detection. Turn off to review options first."
        >
          <Switch
            checked={settings.autoDownload !== false}
            onChange={(v) => void updateSettings({ autoDownload: v })}
          />
        </Row>
        <div className="py-14px border-b border-b-base">
          <div className="text-14px text-t-primary mb-4px">Default video format</div>
          <div className="text-12px text-t-tertiary mb-8px">
            YouTube / Instagram / TikTok output preference.
          </div>
          <Select
            className="w-full"
            value={settings.format}
            onChange={(v) => void updateSettings({ format: v as FormatPreset })}
          >
            <Select.Option value="best">best</Select.Option>
            <Select.Option value="mp4">mp4</Select.Option>
            <Select.Option value="audio-only">audio-only</Select.Option>
          </Select>
        </div>
        <div className="py-14px border-b border-b-base">
          <div className="text-14px text-t-primary mb-4px">YouTube quality</div>
          <div className="text-12px text-t-tertiary mb-8px">
            Default max height for YouTube downloads (Best = highest available).
          </div>
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
        </div>
        <div className="py-14px border-b border-b-base">
          <div className="text-14px text-t-primary mb-4px">YouTube channel max videos</div>
          <div className="text-12px text-t-tertiary mb-8px">
            How many uploads to pull from a channel or @handle URL (1–500).
          </div>
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
        </div>
        <div className="py-14px border-b border-b-base">
          <div className="text-14px text-t-primary mb-4px">YouTube playlist max videos</div>
          <div className="text-12px text-t-tertiary mb-8px">
            How many videos to pull from a playlist or mix URL (1–500).
          </div>
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
        </div>
        <Row
          title="Organize by channel"
          description="Save YouTube downloads under outDir / channel name."
        >
          <Switch
            checked={settings.youtube?.organizeByChannel !== false}
            onChange={(v) => void updateSettings({ youtube: { organizeByChannel: v } })}
          />
        </Row>
        <div className="py-14px border-b border-b-base">
          <div className="text-14px text-t-primary mb-4px">Pinterest board max pins</div>
          <div className="text-12px text-t-tertiary mb-8px">
            How many pins to list/download from a board, profile, or search (1–2000).
          </div>
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
        </div>
        <Row
          title="ZIP board downloads"
          description="After a board/profile batch finishes, create a .zip next to the folder."
        >
          <Switch
            checked={Boolean(settings.pinterest?.zipBoards)}
            onChange={(v) => void updateSettings({ pinterest: { zipBoards: v } })}
          />
        </Row>
        <div className="py-14px border-b border-b-base">
          <div className="text-14px text-t-primary mb-4px">Pinterest cookies</div>
          <div className="text-12px text-t-tertiary mb-8px">
            Paste a Cookie header from your browser (DevTools → Network) to access private boards.
            Stored locally only.
          </div>
          <Input.TextArea
            className="w-full"
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder="_pinterest_sess=…; csrftoken=…"
            value={settings.pinterest?.cookies ?? ""}
            onChange={(v) => void updateSettings({ pinterest: { cookies: v } })}
          />
        </div>
        <div className="py-14px">
          <div className="text-14px text-t-primary mb-4px">Board delay (ms)</div>
          <div className="text-12px text-t-tertiary mb-8px">
            Pause between board items to reduce rate limits.
          </div>
          <InputNumber
            className="w-full"
            min={500}
            max={10000}
            step={100}
            value={settings.delayMs}
            onChange={(v) => void updateSettings({ delayMs: Number(v) || 1500 })}
          />
        </div>
      </div>
    </div>
  );
};

export default DownloadSettings;

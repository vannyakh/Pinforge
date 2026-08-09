import React from "react";
import { Button, Input, Select } from "@arco-design/web-react";
import { useApp } from "@renderer/hooks/context/AppContext";
import { api, type FormatPreset } from "@renderer/api";

const DownloadSettings: React.FC = () => {
  const { settings, updateSettings } = useApp();
  if (!settings) return null;

  return (
    <div className="max-w-560px">
      <div className="text-22px font-600 text-t-primary mb-6px">Output & format</div>
      <div className="text-t-secondary text-14px mb-24px">
        Where files land and default video quality for YouTube / Instagram / TikTok.
      </div>

      <div className="bg-2 rd-12px border border-b-base p-18px flex flex-col gap-16px">
        <div>
          <div className="text-12px text-t-tertiary mb-8px">OUTPUT FOLDER</div>
          <div className="flex gap-8px">
            <Input value={settings.outDir} readOnly className="flex-1" />
            <Button
              onClick={async () => {
                const dir = await api.pickFolder();
                if (dir) await updateSettings({ outDir: dir });
              }}
            >
              Browse…
            </Button>
          </div>
        </div>

        <div>
          <div className="text-12px text-t-tertiary mb-8px">DEFAULT VIDEO FORMAT</div>
          <Select
            className="w-full"
            value={settings.format}
            onChange={(v) => updateSettings({ format: v as FormatPreset })}
          >
            <Select.Option value="best">best</Select.Option>
            <Select.Option value="mp4">mp4</Select.Option>
            <Select.Option value="audio-only">audio-only</Select.Option>
          </Select>
        </div>

        <div>
          <div className="text-12px text-t-tertiary mb-8px">EXTRACTOR API (optional)</div>
          <Input
            placeholder="Piped-compatible base URL — leave empty to use built-in YouTube extractor"
            value={settings.extractorUrl}
            onChange={(v) => updateSettings({ extractorUrl: v })}
          />
          <div className="text-12px text-t-tertiary mt-6px">
            YouTube uses a built-in JS extractor by default. Optional Piped URL overrides it. No
            yt-dlp.
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadSettings;

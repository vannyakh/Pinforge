import React from "react";
import { Button, Input, InputNumber, Message, Select, Switch } from "@arco-design/web-react";
import { FolderOpen } from "@icon-park/react";
import { useApp } from "@renderer/hooks/context/AppContext";
import { api, type FormatPreset, type PresetName, type SystemConfig } from "@renderer/api";

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

const PathField: React.FC<{
  label: string;
  description?: string;
  value: string;
  onBrowse: () => void;
  onOpen: () => void;
}> = ({ label, description, value, onBrowse, onOpen }) => (
  <div className="py-14px border-b border-b-base last:border-b-0">
    <div className="text-14px text-t-primary mb-4px">{label}</div>
    {description && <div className="text-12px text-t-tertiary mb-8px">{description}</div>}
    <div className="flex gap-8px">
      <Input value={value} readOnly className="flex-1" />
      <Button
        icon={<FolderOpen theme="outline" size="16" fill="currentColor" strokeWidth={3} />}
        onClick={onBrowse}
      >
        Browse…
      </Button>
      <Button onClick={onOpen}>Open</Button>
    </div>
  </div>
);

const SystemSettings: React.FC = () => {
  const { settings, updateSettings } = useApp();
  if (!settings?.system) return null;

  const system = settings.system;

  const patchSystem = async (partial: Partial<SystemConfig>) => {
    await updateSettings({ system: partial });
    if (partial.hardwareAcceleration !== undefined) {
      Message.info("Restart Pinforge for hardware acceleration changes to apply.");
    }
  };

  return (
    <div className="max-w-640px w-full">
      <div className="text-22px font-600 text-t-primary mb-6px">System</div>
      <div className="text-t-secondary text-14px mb-24px">
        App behavior, download defaults, and environment paths.
      </div>

      <div className="text-12px font-500 text-t-tertiary tracking-wide uppercase mb-8px">
        Application
      </div>
      <div className="bg-2 rd-12px border border-b-base px-18px mb-28px">
        <Row title="Language" description="Interface language.">
          <Select
            style={{ width: 160 }}
            value={system.language}
            onChange={(v) => patchSystem({ language: String(v) })}
          >
            <Select.Option value="en">English</Select.Option>
          </Select>
        </Row>
        <Row
          title="Start on Boot"
          description="Launch Pinforge automatically when you sign in to Windows or macOS."
        >
          <Switch checked={system.startOnBoot} onChange={(v) => patchSystem({ startOnBoot: v })} />
        </Row>
        <Row
          title="Close to Tray"
          description="Hide to the system tray instead of quitting when you close the window."
        >
          <Switch checked={system.closeToTray} onChange={(v) => patchSystem({ closeToTray: v })} />
        </Row>
        <Row
          title="Hardware Acceleration"
          description="Use the GPU to render the UI. Disable if the app crashes on launch or graphics flicker. Restart required."
        >
          <Switch
            checked={system.hardwareAcceleration}
            onChange={(v) => patchSystem({ hardwareAcceleration: v })}
          />
        </Row>
        <Row title="Notifications" description="Allow desktop notifications from Pinforge.">
          <Switch
            checked={system.notifications}
            onChange={(v) => patchSystem({ notifications: v })}
          />
        </Row>
        {system.notifications && (
          <Row title="Download complete" description="Notify when a download or board job finishes.">
            <Switch
              checked={system.notifyOnDownloadComplete}
              onChange={(v) => patchSystem({ notifyOnDownloadComplete: v })}
            />
          </Row>
        )}
      </div>

      <div className="text-12px font-500 text-t-tertiary tracking-wide uppercase mb-8px">
        Download defaults
      </div>
      <div className="bg-2 rd-12px border border-b-base px-18px mb-28px">
        <Row title="Enhance images by default" description="Applies to Pinterest stills.">
          <Switch checked={settings.enhance} onChange={(v) => updateSettings({ enhance: v })} />
        </Row>
        <div className="py-14px border-b border-b-base">
          <div className="text-14px text-t-primary mb-4px">Enhance preset</div>
          <div className="text-12px text-t-tertiary mb-8px">Default quality pipeline for stills.</div>
          <Select
            className="w-full"
            value={settings.preset}
            onChange={(v) => updateSettings({ preset: v as PresetName })}
          >
            {(Object.keys(settings.presets) as PresetName[]).map((key) => (
              <Select.Option key={key} value={key}>
                {settings.presets[key].label} — {settings.presets[key].description}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div className="py-14px border-b border-b-base">
          <div className="text-14px text-t-primary mb-4px">Default video format</div>
          <div className="text-12px text-t-tertiary mb-8px">
            YouTube / Instagram / TikTok output preference.
          </div>
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
            onChange={(v) => updateSettings({ delayMs: Number(v) || 1500 })}
          />
        </div>
      </div>

      <div className="text-12px font-500 text-t-tertiary tracking-wide uppercase mb-8px">
        Environment
      </div>
      <div className="bg-2 rd-12px border border-b-base px-18px mb-16px">
        <PathField
          label="Work directory"
          description="Default folder for saved media packs."
          value={settings.outDir}
          onBrowse={async () => {
            const dir = await api.pickFolderPath(settings.outDir);
            if (dir) await updateSettings({ outDir: dir });
          }}
          onOpen={() => void api.openPath(settings.outDir)}
        />
        <PathField
          label="Temp directory"
          description="Scratch space for extractors and Playwright downloads."
          value={system.tempDir}
          onBrowse={async () => {
            const dir = await api.pickFolderPath(system.tempDir);
            if (dir) await patchSystem({ tempDir: dir });
          }}
          onOpen={() => void api.openPath(system.tempDir)}
        />
        <PathField
          label="Log directory"
          description="Where app logs are written."
          value={system.logDir}
          onBrowse={async () => {
            const dir = await api.pickFolderPath(system.logDir);
            if (dir) await patchSystem({ logDir: dir });
          }}
          onOpen={() => void api.openPath(system.logDir)}
        />
        <div className="py-14px">
          <div className="text-14px text-t-primary mb-4px">Extractor API (optional)</div>
          <div className="text-12px text-t-tertiary mb-8px">
            Piped-compatible base URL for YouTube. Leave empty for the built-in extractor.
          </div>
          <Input
            placeholder="https://piped.example.com"
            value={settings.extractorUrl}
            onChange={(v) => updateSettings({ extractorUrl: v })}
          />
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;

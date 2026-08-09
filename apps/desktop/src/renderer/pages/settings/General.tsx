import React from "react";
import { Select, Switch, InputNumber } from "@arco-design/web-react";
import { useApp } from "@renderer/hooks/context/AppContext";
import type { PresetName } from "@renderer/api";

const GeneralSettings: React.FC = () => {
  const { settings, updateSettings } = useApp();
  if (!settings) return null;

  return (
    <div className="max-w-560px">
      <div className="text-22px font-600 text-t-primary mb-6px">Preferences</div>
      <div className="text-t-secondary text-14px mb-24px">
        Defaults for image enhance and board pacing.
      </div>

      <div className="flex flex-col gap-20px">
        <div className="bg-2 rd-12px border border-b-base p-18px flex flex-col gap-16px">
          <div>
            <div className="text-12px text-t-tertiary mb-8px">DEFAULT ENHANCE PRESET</div>
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

          <div className="flex items-center justify-between">
            <div>
              <div className="text-14px text-t-primary">Enhance images by default</div>
              <div className="text-12px text-t-tertiary">Applies to Pinterest stills</div>
            </div>
            <Switch checked={settings.enhance} onChange={(v) => updateSettings({ enhance: v })} />
          </div>

          <div>
            <div className="text-12px text-t-tertiary mb-8px">BOARD DELAY (MS)</div>
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
      </div>
    </div>
  );
};

export default GeneralSettings;

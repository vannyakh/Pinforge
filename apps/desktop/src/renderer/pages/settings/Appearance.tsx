import React, { useState } from "react";
import { Button, Message, Slider } from "@arco-design/web-react";
import { Plus, Delete } from "@icon-park/react";
import { useThemeContext } from "@renderer/hooks/context/ThemeContext";
import {
  DEFAULT_UI_SCALE,
  SYSTEM_THEME_ID,
} from "@/common/theme/constants";
import type { Theme } from "@/common/theme/types";
import AddThemeModal from "./AddThemeModal";

interface ThemePreviewProps {
  theme: Theme;
  systemSplit?: boolean;
}

function ThemePreview({ theme, systemSplit }: ThemePreviewProps) {
  if (systemSplit) {
    return (
      <div className="appearance-card__preview appearance-card__preview--split">
        <div className="appearance-card__half is-light" />
        <div className="appearance-card__half is-dark" />
      </div>
    );
  }
  if (theme.preview || theme.backgroundImage) {
    return (
      <div
        className="appearance-card__preview"
        style={{
          backgroundImage: `url(${theme.preview || theme.backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    );
  }
  return (
    <div className={`appearance-card__preview appearance-card__preview--${theme.appearance}`}>
      <div className="appearance-card__fake-ui">
        <div className="appearance-card__fake-bar" />
        <div className="appearance-card__fake-row" />
        <div className="appearance-card__fake-row short" />
      </div>
    </div>
  );
}

const AppearanceSettings: React.FC = () => {
  const {
    themes,
    activeId,
    selectTheme,
    addTheme,
    deleteTheme,
    uiScale,
    setUiScale,
  } = useThemeContext();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="appearance-page max-w-820px">
      <div className="flex items-start justify-between gap-16px mb-20px">
        <div>
          <div className="text-22px font-600 text-t-primary mb-6px">Theme</div>
          <div className="text-t-secondary text-14px">
            Select or customize a theme. Tokens and CSS apply instantly.
          </div>
        </div>
        <Button type="primary" icon={<Plus theme="outline" size="14" />} onClick={() => setAddOpen(true)}>
          Add Theme
        </Button>
      </div>

      <div className="appearance-grid">
        {themes.map((theme) => {
          const active = activeId === theme.id;
          return (
            <div key={theme.id} className={`appearance-card ${active ? "is-active" : ""}`}>
              <button
                type="button"
                className="appearance-card__hit"
                onClick={() => void selectTheme(theme.id)}
              >
                <ThemePreview theme={theme} systemSplit={theme.id === SYSTEM_THEME_ID} />
                <div className="appearance-card__name">{theme.name}</div>
              </button>
              {!theme.builtin && (
                <button
                  type="button"
                  className="appearance-card__delete"
                  title="Delete theme"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteTheme(theme.id).then(() => Message.success("Theme removed"));
                  }}
                >
                  <Delete theme="outline" size="14" fill="currentColor" strokeWidth={3} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-32px">
        <div className="text-16px font-600 text-t-primary mb-6px">Scale</div>
        <div className="text-t-secondary text-13px mb-14px">
          Zoom the whole interface. Useful on high-DPI displays.
        </div>
        <div className="bg-2 border border-b-base rd-12px px-18px py-16px">
          <div className="flex items-center justify-between mb-10px">
            <span className="text-14px text-t-primary">Scale</span>
            <span className="text-13px text-t-secondary">{uiScale}%</span>
          </div>
          <Slider
            min={80}
            max={120}
            step={5}
            value={uiScale}
            onChange={(v) => setUiScale(Number(v))}
          />
          <div className="mt-12px">
            <Button
              size="small"
              type="secondary"
              onClick={() => setUiScale(DEFAULT_UI_SCALE)}
            >
              Reset zoom
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-28px">
        <div className="text-16px font-600 text-t-primary mb-6px">UI tokens</div>
        <div className="text-t-secondary text-13px mb-12px">
          Custom themes can override CSS variables. Common tokens:
        </div>
        <div className="bg-2 border border-b-base rd-12px px-16px py-14px text-12px text-t-secondary font-mono leading-relaxed">
          --primary · --brand · --bg-1 · --bg-2 · --text-primary · --text-secondary ·
          --border-base
        </div>
      </div>

      <AddThemeModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={async (payload) => {
          await addTheme(payload);
        }}
      />
    </div>
  );
};

export default AppearanceSettings;

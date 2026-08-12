import React, { useMemo, useState } from "react";
import { Button, Message, Slider } from "@arco-design/web-react";
import { Plus, Delete, CheckOne } from "@icon-park/react";
import { useThemeContext } from "@renderer/hooks/context/ThemeContext";
import {
  DEFAULT_UI_SCALE,
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  SYSTEM_THEME_ID,
  UI_SCALE_STEP,
} from "@/common/theme/constants";
import {
  FONT_SIZE_KEYS,
  FONT_SIZE_SPECS,
  FONT_SIZE_STEP,
  type FontSizeKey,
} from "@/common/config/fontSizes";
import type { Theme } from "@/common/theme/types";
import {
  SettingsHeader,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "./components/SettingsLayout";
import AddThemeModal from "./AddThemeModal";

interface ThemePreviewPalette {
  appBg: string;
  headerBg: string;
  sideBg: string;
  mainBg: string;
  border: string;
  accent: string;
  textMuted: string;
  userBubble: string;
  aiBubble: string;
}

const fallbackPalette: Record<"light" | "dark", ThemePreviewPalette> = {
  light: {
    appBg: "#f7f8fa",
    headerBg: "#eef1f5",
    sideBg: "#eef1f5",
    mainBg: "#f7f8fa",
    border: "#d9dde5",
    accent: "#3b82f6",
    textMuted: "#8b95a7",
    userBubble: "#dbeafe",
    aiBubble: "#e5e7eb",
  },
  dark: {
    appBg: "#171a1f",
    headerBg: "#1f242d",
    sideBg: "#1f242d",
    mainBg: "#171a1f",
    border: "#303744",
    accent: "#60a5fa",
    textMuted: "#8b95a7",
    userBubble: "#1e3a5f",
    aiBubble: "#2b313c",
  },
};

const FONT_SIZE_LABEL: Record<FontSizeKey, string> = {
  chat: "Chat text size",
  markdown: "Markdown text size",
  code: "Code font size",
};

const ThemeLayoutPreview: React.FC<{ palette: ThemePreviewPalette }> = ({ palette }) => (
  <div className="absolute inset-0 pointer-events-none">
    <div className="absolute inset-0" style={{ background: palette.appBg }} />
    <div
      className="absolute left-8px right-8px top-8px bottom-8px rd-8px overflow-hidden border border-solid"
      style={{ borderColor: palette.border, background: palette.mainBg }}
    >
      <div
        className="h-14px border-b border-solid flex items-center px-6px gap-4px"
        style={{ borderColor: palette.border, background: palette.headerBg }}
      >
        <span className="block w-5px h-5px rd-full" style={{ background: palette.accent }} />
        <span
          className="block w-18px h-4px rd-full"
          style={{ background: palette.border, opacity: 0.45 }}
        />
      </div>
      <div className="flex" style={{ height: "calc(100% - 14px)" }}>
        <div
          className="border-r border-solid px-3px py-3px flex flex-col gap-3px"
          style={{ width: "23%", borderColor: palette.border, background: palette.sideBg }}
        >
          <span
            className="block h-3px rd-full"
            style={{ background: palette.textMuted, opacity: 0.4 }}
          />
          <span
            className="block h-3px rd-full w-4/5"
            style={{ background: palette.textMuted, opacity: 0.33 }}
          />
        </div>
        <div className="px-4px py-4px flex flex-col gap-4px flex-1">
          <span className="block h-6px rd-6px w-4/5" style={{ background: palette.aiBubble }} />
          <span
            className="block h-6px rd-6px w-3/5 self-end"
            style={{ background: palette.userBubble }}
          />
        </div>
      </div>
    </div>
  </div>
);

const SystemThemePreview: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none">
    <ThemeLayoutPreview palette={fallbackPalette.light} />
    <div className="absolute inset-0" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}>
      <ThemeLayoutPreview palette={fallbackPalette.dark} />
    </div>
  </div>
);

const FontSizeStepper: React.FC<{
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (next: number) => void;
}> = ({ value, min, max, defaultValue, onChange }) => {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="flex items-center gap-10px ml-auto">
      <Button
        size="mini"
        type="secondary"
        shape="circle"
        className="w-28px h-28px !min-w-28px flex items-center justify-center p-0"
        onClick={() => onChange(clamp(value - FONT_SIZE_STEP))}
        disabled={value <= min}
      >
        -
      </Button>
      <span
        className="text-13px text-t-primary text-center min-w-32px"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
      <Button
        size="mini"
        type="secondary"
        shape="circle"
        className="w-28px h-28px !min-w-28px flex items-center justify-center p-0"
        onClick={() => onChange(clamp(value + FONT_SIZE_STEP))}
        disabled={value >= max}
      >
        +
      </Button>
      <Button
        size="small"
        type="text"
        className="px-4px h-28px"
        onClick={() => onChange(defaultValue)}
        disabled={value === defaultValue}
      >
        Reset
      </Button>
    </div>
  );
};

const AppearanceSettings: React.FC = () => {
  const {
    themes,
    activeId,
    selectTheme,
    addTheme,
    deleteTheme,
    fontScale,
    setFontScale,
    fontSizes,
    setFontSize,
  } = useThemeContext();
  const [addOpen, setAddOpen] = useState(false);

  // Virtual "Follow System" card first (default preference) — not part of BUILTIN_THEMES.
  const displayThemes = useMemo(() => {
    const systemDark =
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const systemCard: Theme = {
      id: SYSTEM_THEME_ID,
      name: "System",
      appearance: systemDark ? "dark" : "light",
      builtin: true,
      created_at: 0,
      updated_at: 0,
    };
    return [systemCard, ...themes];
  }, [themes]);

  return (
    <SettingsPage width="appearance" className="appearance-page">
      <SettingsHeader
        title="Appearance"
        description="Theme, typography, and interface scale."
        actions={
          <Button
            type="primary"
            size="small"
            icon={<Plus theme="outline" size="14" />}
            onClick={() => setAddOpen(true)}
          >
            Add Theme
          </Button>
        }
      />

      <SettingsSection title="Theme">
        <div className="appearance-grid py-4px">
          {displayThemes.map((item) => {
            const active = activeId === item.id;
            const palette = fallbackPalette[item.appearance];
            const cardStyle = item.cover
              ? {
                  backgroundImage: `url(${item.cover})`,
                  backgroundSize: "100% 100%",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat" as const,
                  backgroundColor: palette.appBg,
                }
              : { backgroundColor: palette.appBg };

            return (
              <div
                key={item.id}
                className={`appearance-card ${active ? "is-active" : ""}`}
                style={cardStyle}
                onClick={() =>
                  void selectTheme(item.id).then(() => Message.success(`Applied ${item.name}`))
                }
              >
                {item.id === SYSTEM_THEME_ID ? (
                  <SystemThemePreview />
                ) : (
                  !item.cover && <ThemeLayoutPreview palette={palette} />
                )}

                <div className="appearance-card__footer">
                  <span className="appearance-card__name">{item.name}</span>
                </div>

                {active && (
                  <div className="appearance-card__check">
                    <CheckOne
                      theme="filled"
                      size="20"
                      fill="var(--color-primary, var(--primary))"
                    />
                  </div>
                )}

                {!item.builtin && (
                  <button
                    type="button"
                    className="appearance-card__delete"
                    title="Delete theme"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteTheme(item.id).then(() => Message.success("Theme removed"));
                    }}
                  >
                    <Delete theme="outline" size="14" fill="currentColor" strokeWidth={3} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Typography">
        <div className="flex flex-col">
          {FONT_SIZE_KEYS.map((key) => (
            <SettingsRow key={key} title={FONT_SIZE_LABEL[key]}>
              <FontSizeStepper
                value={fontSizes[key]}
                min={FONT_SIZE_SPECS[key].min}
                max={FONT_SIZE_SPECS[key].max}
                defaultValue={FONT_SIZE_SPECS[key].default}
                onChange={(px) => void setFontSize(key, px)}
              />
            </SettingsRow>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Interface scale">
        <SettingsRow title="UI scale">
          <div className="flex items-center gap-x-12px gap-y-10px flex-wrap justify-end max-w-full">
            <Button
              size="mini"
              type="secondary"
              shape="circle"
              className="w-28px h-28px !min-w-28px flex items-center justify-center p-0"
              onClick={() =>
                void setFontScale(Math.max(MIN_UI_SCALE, +(fontScale - UI_SCALE_STEP).toFixed(2)))
              }
              disabled={fontScale <= MIN_UI_SCALE}
            >
              -
            </Button>
            <Slider
              className="flex-1 min-w-160px max-w-360px"
              min={MIN_UI_SCALE}
              max={MAX_UI_SCALE}
              step={UI_SCALE_STEP}
              value={fontScale}
              onChange={(v) => void setFontScale(Number(v))}
            />
            <Button
              size="mini"
              type="secondary"
              shape="circle"
              className="w-28px h-28px !min-w-28px flex items-center justify-center p-0"
              onClick={() =>
                void setFontScale(Math.min(MAX_UI_SCALE, +(fontScale + UI_SCALE_STEP).toFixed(2)))
              }
              disabled={fontScale >= MAX_UI_SCALE}
            >
              +
            </Button>
            <span
              className="text-13px text-t-primary min-w-48px text-right"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {Math.round(fontScale * 100)}%
            </span>
            <Button
              size="small"
              type="text"
              className="px-4px h-28px"
              disabled={Math.abs(fontScale - DEFAULT_UI_SCALE) < 0.01}
              onClick={() => void setFontScale(DEFAULT_UI_SCALE)}
            >
              Reset zoom
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      <AddThemeModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={async (payload) => {
          await addTheme(payload);
        }}
      />
    </SettingsPage>
  );
};

export default AppearanceSettings;

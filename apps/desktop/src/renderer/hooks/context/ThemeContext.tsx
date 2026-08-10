import type { PropsWithChildren } from "react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Theme, ThemeAppearance } from "@/common/theme/types";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  DARK_THEME_ID,
  DEFAULT_THEME_ID,
  DEFAULT_UI_SCALE,
  FONT_SIZES_STORAGE_KEY,
  LIGHT_THEME_ID,
  THEME_ID_STORAGE_KEY,
  THEME_STORAGE_KEY,
  UI_SCALE_STORAGE_KEY,
} from "@/common/theme/constants";
import { resolveActiveTheme } from "@/common/theme/resolveTheme";
import {
  FONT_SIZE_KEYS,
  clampFontSize,
  defaultFontSizes,
  type FontSizeKey,
  type FontSizes,
} from "@/common/config/fontSizes";
import { BUILTIN_THEMES } from "@renderer/theme/builtinThemes";
import {
  loadCustomThemes,
  removeCustomTheme,
  upsertCustomTheme,
} from "@renderer/theme/customThemes";
import { injectBackgroundCssBlock } from "@renderer/pages/settings/AppearanceSettings/backgroundUtils";
import { applyTheme, applyUiScale, clampUiScale } from "@renderer/utils/theme/applyTheme";
import { applyFontSizes } from "@renderer/utils/theme/applyFontSizes";

interface ThemeContextValue {
  theme: ThemeAppearance;
  setTheme: (appearance: ThemeAppearance) => Promise<void>;
  activeTheme: Theme | null;
  activeId: string | null;
  themes: Theme[];
  customThemes: Theme[];
  selectTheme: (id: string) => Promise<void>;
  addTheme: (
    theme: Omit<Theme, "id" | "builtin" | "created_at" | "updated_at"> & { id?: string }
  ) => Promise<Theme>;
  deleteTheme: (id: string) => Promise<void>;
  /** Zoom factor 0.8–1.3 (AionUi default 0.95) */
  fontScale: number;
  setFontScale: (factor: number) => Promise<void>;
  /** @deprecated use fontScale */
  uiScale: number;
  setUiScale: (percentOrFactor: number) => void;
  fontSizes: FontSizes;
  setFontSize: (key: FontSizeKey, px: number) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStoredThemeId(): string {
  try {
    const id = localStorage.getItem(THEME_ID_STORAGE_KEY);
    if (id) return id;
    const appearance = localStorage.getItem(THEME_STORAGE_KEY);
    if (appearance === "light" || appearance === "dark") return appearance;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID;
}

function readUiScale(): number {
  try {
    const n = Number(localStorage.getItem(UI_SCALE_STORAGE_KEY));
    if (!Number.isFinite(n)) return DEFAULT_UI_SCALE;
    // Migrate legacy percent storage (80–120) → factor
    if (n > 3) return clampUiScale(n / 100);
    return clampUiScale(n);
  } catch {
    /* ignore */
  }
  return DEFAULT_UI_SCALE;
}

function readFontSizes(): FontSizes {
  const base = defaultFontSizes();
  try {
    const raw = localStorage.getItem(FONT_SIZES_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<FontSizes>;
    for (const key of FONT_SIZE_KEYS) {
      if (typeof parsed[key] === "number") {
        base[key] = clampFontSize(key, parsed[key]!);
      }
    }
  } catch {
    /* ignore */
  }
  return base;
}

export const ThemeProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [customThemes, setCustomThemes] = useState<Theme[]>(() => loadCustomThemes());
  const [activeId, setActiveId] = useState<string>(readStoredThemeId);
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);
  const [fontScale, setFontScaleState] = useState<number>(readUiScale);
  const [fontSizes, setFontSizesState] = useState<FontSizes>(readFontSizes);

  const themes = useMemo(() => [...BUILTIN_THEMES, ...customThemes], [customThemes]);

  const activeTheme = useMemo(
    () => resolveActiveTheme(activeId, themes, prefersDark),
    [activeId, themes, prefersDark]
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(activeTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, activeTheme.appearance);
      localStorage.setItem(THEME_ID_STORAGE_KEY, activeId);
    } catch {
      /* ignore */
    }
  }, [activeTheme, activeId]);

  useEffect(() => {
    applyUiScale(fontScale);
    try {
      localStorage.setItem(UI_SCALE_STORAGE_KEY, String(fontScale));
    } catch {
      /* ignore */
    }
  }, [fontScale]);

  useEffect(() => {
    applyFontSizes(fontSizes);
    try {
      localStorage.setItem(FONT_SIZES_STORAGE_KEY, JSON.stringify(fontSizes));
    } catch {
      /* ignore */
    }
  }, [fontSizes]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CUSTOM_THEMES_STORAGE_KEY) setCustomThemes(loadCustomThemes());
      if (e.key === FONT_SIZES_STORAGE_KEY) setFontSizesState(readFontSizes());
      if (e.key === UI_SCALE_STORAGE_KEY) setFontScaleState(readUiScale());
      if (e.key === THEME_ID_STORAGE_KEY && e.newValue) setActiveId(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const selectTheme = useCallback(async (id: string) => {
    setActiveId(id);
  }, []);

  const setTheme = useCallback(
    async (appearance: ThemeAppearance) => {
      await selectTheme(appearance === "dark" ? DARK_THEME_ID : LIGHT_THEME_ID);
    },
    [selectTheme]
  );

  const addTheme = useCallback(
    async (
      input: Omit<Theme, "id" | "builtin" | "created_at" | "updated_at"> & { id?: string }
    ) => {
      const now = Date.now();
      let css = input.css || "";
      if (input.cover) {
        css = injectBackgroundCssBlock(css, input.cover);
      }
      const theme: Theme = {
        id: input.id ?? `custom-${now.toString(36)}`,
        name: input.name.trim() || "Custom theme",
        appearance: input.appearance,
        tokens: input.tokens,
        css,
        cover: input.cover,
        builtin: false,
        created_at: now,
        updated_at: now,
      };
      setCustomThemes((prev) => upsertCustomTheme(theme, prev));
      setActiveId(theme.id);
      return theme;
    },
    []
  );

  const deleteTheme = useCallback(async (id: string) => {
    setCustomThemes((prev) => removeCustomTheme(id, prev));
    setActiveId((curr) => (curr === id ? DEFAULT_THEME_ID : curr));
  }, []);

  const setFontScale = useCallback(async (factor: number) => {
    setFontScaleState(clampUiScale(factor));
  }, []);

  const setUiScale = useCallback((percentOrFactor: number) => {
    const factor = percentOrFactor > 3 ? percentOrFactor / 100 : percentOrFactor;
    setFontScaleState(clampUiScale(factor));
  }, []);

  const setFontSize = useCallback(async (key: FontSizeKey, px: number) => {
    setFontSizesState((prev) => ({ ...prev, [key]: clampFontSize(key, px) }));
  }, []);

  const value = useMemo(
    () => ({
      theme: activeTheme.appearance,
      setTheme,
      activeTheme,
      activeId,
      themes,
      customThemes,
      selectTheme,
      addTheme,
      deleteTheme,
      fontScale,
      setFontScale,
      uiScale: Math.round(fontScale * 100),
      setUiScale,
      fontSizes,
      setFontSize,
    }),
    [
      activeTheme,
      activeId,
      themes,
      customThemes,
      setTheme,
      selectTheme,
      addTheme,
      deleteTheme,
      fontScale,
      setFontScale,
      setUiScale,
      fontSizes,
      setFontSize,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return context;
};

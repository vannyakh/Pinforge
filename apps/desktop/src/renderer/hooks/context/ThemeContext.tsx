import type { PropsWithChildren } from "react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Theme, ThemeAppearance } from "@/common/theme/types";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  DARK_THEME_ID,
  DEFAULT_UI_SCALE,
  LIGHT_THEME_ID,
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  SYSTEM_THEME_ID,
  THEME_ID_STORAGE_KEY,
  THEME_STORAGE_KEY,
  UI_SCALE_STORAGE_KEY,
} from "@/common/theme/constants";
import { BUILTIN_THEMES } from "@renderer/theme/builtinThemes";
import {
  loadCustomThemes,
  removeCustomTheme,
  upsertCustomTheme,
} from "@renderer/theme/customThemes";
import { applyTheme, applyUiScale } from "@renderer/utils/theme/applyTheme";

interface ThemeContextValue {
  theme: ThemeAppearance;
  setTheme: (appearance: ThemeAppearance) => Promise<void>;
  activeTheme: Theme | null;
  activeId: string | null;
  themes: Theme[];
  customThemes: Theme[];
  selectTheme: (id: string) => Promise<void>;
  addTheme: (theme: Omit<Theme, "id" | "builtin" | "created_at" | "updated_at"> & { id?: string }) => Promise<Theme>;
  deleteTheme: (id: string) => Promise<void>;
  uiScale: number;
  setUiScale: (percent: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemAppearance(): ThemeAppearance {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  return DARK_THEME_ID;
}

function readUiScale(): number {
  try {
    const n = Number(localStorage.getItem(UI_SCALE_STORAGE_KEY));
    if (Number.isFinite(n)) return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, n));
  } catch {
    /* ignore */
  }
  return DEFAULT_UI_SCALE;
}

export const ThemeProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [customThemes, setCustomThemes] = useState<Theme[]>(() => loadCustomThemes());
  const [activeId, setActiveId] = useState<string>(readStoredThemeId);
  const [systemPref, setSystemPref] = useState<ThemeAppearance>(systemAppearance);
  const [uiScale, setUiScaleState] = useState<number>(readUiScale);

  const themes = useMemo(
    () => [...BUILTIN_THEMES, ...customThemes],
    [customThemes]
  );

  const resolveTheme = useCallback(
    (id: string): Theme => {
      const found = themes.find((t) => t.id === id);
      if (!found) return BUILTIN_THEMES.find((t) => t.id === DARK_THEME_ID)!;
      if (found.id === SYSTEM_THEME_ID) {
        return { ...found, appearance: systemPref, name: "Follow System" };
      }
      return found;
    },
    [themes, systemPref]
  );

  const activeTheme = useMemo(() => resolveTheme(activeId), [resolveTheme, activeId]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemPref(mq.matches ? "dark" : "light");
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
    applyUiScale(uiScale);
    try {
      localStorage.setItem(UI_SCALE_STORAGE_KEY, String(uiScale));
    } catch {
      /* ignore */
    }
  }, [uiScale]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CUSTOM_THEMES_STORAGE_KEY) setCustomThemes(loadCustomThemes());
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
      const theme: Theme = {
        id: input.id ?? `custom-${now.toString(36)}`,
        name: input.name.trim() || "Custom theme",
        appearance: input.appearance,
        tokens: input.tokens,
        css: input.css,
        backgroundImage: input.backgroundImage,
        preview: input.preview ?? input.backgroundImage,
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

  const deleteTheme = useCallback(
    async (id: string) => {
      setCustomThemes((prev) => removeCustomTheme(id, prev));
      setActiveId((curr) => (curr === id ? DARK_THEME_ID : curr));
    },
    []
  );

  const setUiScale = useCallback((percent: number) => {
    setUiScaleState(Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Math.round(percent))));
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
      uiScale,
      setUiScale,
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
      uiScale,
      setUiScale,
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

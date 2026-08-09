import type { Theme } from "@/common/theme/types";
import { CUSTOM_THEMES_STORAGE_KEY } from "@/common/theme/constants";
import { injectBackgroundCssBlock } from "@renderer/pages/settings/AppearanceSettings/backgroundUtils";

function normalizeTheme(raw: Theme): Theme | null {
  if (!raw || typeof raw.id !== "string" || raw.builtin) return null;
  const legacy = raw as Theme & { backgroundImage?: string; preview?: string };
  const cover = raw.cover || legacy.preview || legacy.backgroundImage;
  let css = raw.css || "";
  if (cover && css && !css.includes("AionUi Theme Background Start")) {
    css = injectBackgroundCssBlock(css, cover);
  } else if (cover && !css) {
    css = injectBackgroundCssBlock("", cover);
  }
  return {
    id: raw.id,
    name: raw.name || "Custom theme",
    appearance: raw.appearance === "dark" ? "dark" : "light",
    cover,
    tokens: raw.tokens,
    css,
    builtin: false,
    created_at: raw.created_at || Date.now(),
    updated_at: raw.updated_at || Date.now(),
  };
}

export function loadCustomThemes(): Theme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Theme[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTheme).filter((t): t is Theme => Boolean(t));
  } catch {
    return [];
  }
}

export function saveCustomThemes(themes: Theme[]): void {
  localStorage.setItem(
    CUSTOM_THEMES_STORAGE_KEY,
    JSON.stringify(themes.filter((t) => !t.builtin))
  );
}

export function upsertCustomTheme(theme: Theme, existing: Theme[]): Theme[] {
  const next = [...existing.filter((t) => t.id !== theme.id), theme];
  saveCustomThemes(next);
  return next;
}

export function removeCustomTheme(id: string, existing: Theme[]): Theme[] {
  const next = existing.filter((t) => t.id !== id);
  saveCustomThemes(next);
  return next;
}

import type { Theme } from "@/common/theme/types";
import { CUSTOM_THEMES_STORAGE_KEY } from "@/common/theme/constants";

export function loadCustomThemes(): Theme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Theme[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => t && typeof t.id === "string" && !t.builtin);
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

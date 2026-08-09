import type { Theme } from "@/common/theme/types";
import { DARK_THEME_ID, LIGHT_THEME_ID, SYSTEM_THEME_ID } from "@/common/theme/constants";

const T0 = 0;

export const BUILTIN_THEMES: Theme[] = [
  {
    id: LIGHT_THEME_ID,
    name: "Light",
    appearance: "light",
    builtin: true,
    created_at: T0,
    updated_at: T0,
  },
  {
    id: DARK_THEME_ID,
    name: "Dark",
    appearance: "dark",
    builtin: true,
    created_at: T0,
    updated_at: T0,
  },
  {
    id: SYSTEM_THEME_ID,
    name: "Follow System",
    appearance: "dark",
    builtin: true,
    created_at: T0,
    updated_at: T0,
  },
];

/** Soft accent presets users can start from when adding a theme */
export const TOKEN_PRESETS: Record<string, Record<string, string>> = {
  pinforge: {
    "--primary": "#e60023",
    "--brand": "#e60023",
  },
  ocean: {
    "--primary": "#3b82f6",
    "--brand": "#60a5fa",
  },
  forest: {
    "--primary": "#22c55e",
    "--brand": "#4ade80",
  },
};

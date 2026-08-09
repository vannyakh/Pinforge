/**
 * Theme types — aligned with AionUi `@/common/theme/types`
 */
export type ThemeAppearance = "light" | "dark";

export type Theme = {
  id: string;
  name: string;
  appearance: ThemeAppearance;
  /** CSS variable overrides, e.g. { "--primary": "#ff4d4f" } */
  tokens?: Record<string, string>;
  /** Raw CSS injected as #theme-decoration */
  css?: string;
  /** Optional wallpaper (data URL or https) */
  backgroundImage?: string;
  /** Thumbnail for theme picker (data URL) */
  preview?: string;
  builtin: boolean;
  created_at: number;
  updated_at: number;
};

export type UiScalePercent = number;

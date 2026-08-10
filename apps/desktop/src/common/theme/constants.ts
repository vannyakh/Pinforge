export const LIGHT_THEME_ID = "light";
export const DARK_THEME_ID = "dark";
/** Sentinel id stored in `theme.activeId`: resolve to Light/Dark from the OS appearance. */
export const SYSTEM_THEME_ID = "system";

/** Default active theme — follow OS light/dark (system UI preference). */
export const DEFAULT_THEME_ID = SYSTEM_THEME_ID;

/** Active appearance for FOUC (`light` | `dark`) */
export const THEME_STORAGE_KEY = "__aionui_theme";
/** Active theme id (`light` | `dark` | `system` | custom-…) */
export const THEME_ID_STORAGE_KEY = "__aionui_theme_id";
/** User-created themes JSON */
export const CUSTOM_THEMES_STORAGE_KEY = "__aionui_custom_themes";
/** UI zoom factor (0.8–1.3), AionUi `ui.zoomFactor` */
export const UI_SCALE_STORAGE_KEY = "__aionui_ui_scale";
/** Per-region font sizes JSON */
export const FONT_SIZES_STORAGE_KEY = "__aionui_font_sizes";

/** AionUi default zoom factor (95%). */
export const DEFAULT_UI_SCALE = 0.95;
export const MIN_UI_SCALE = 0.8;
export const MAX_UI_SCALE = 1.3;
export const UI_SCALE_STEP = 0.05;

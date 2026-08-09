export type { Theme, ThemeAppearance } from "./theme/types";
export {
  LIGHT_THEME_ID,
  DARK_THEME_ID,
  SYSTEM_THEME_ID,
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  THEME_ID_STORAGE_KEY,
  CUSTOM_THEMES_STORAGE_KEY,
  UI_SCALE_STORAGE_KEY,
  FONT_SIZES_STORAGE_KEY,
  DEFAULT_UI_SCALE,
  MIN_UI_SCALE,
  MAX_UI_SCALE,
  UI_SCALE_STEP,
} from "./theme/constants";
export { resolveActiveTheme } from "./theme/resolveTheme";
export {
  FONT_SIZE_SPECS,
  FONT_SIZE_KEYS,
  FONT_SIZE_STEP,
  defaultFontSizes,
  clampFontSize,
} from "./config/fontSizes";
export type { FontSizeKey, FontSizes } from "./config/fontSizes";

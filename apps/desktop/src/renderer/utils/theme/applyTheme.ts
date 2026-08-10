import type { Theme } from "@/common/theme/types";
import { DEFAULT_UI_SCALE, MAX_UI_SCALE, MIN_UI_SCALE } from "@/common/theme/constants";
import { processCustomCss } from "./customCssProcessor";

const TOKENS_STYLE_ID = "theme-tokens";
const DECORATION_STYLE_ID = "theme-decoration";

function upsertStyle(id: string, css: string | null, root: Document = document): void {
  const existing = root.getElementById(id);
  if (!css) {
    existing?.remove();
    return;
  }
  const el = (existing as HTMLStyleElement | null) ?? root.createElement("style");
  el.id = id;
  el.textContent = css;
  root.head.appendChild(el);
}

function tokensToCss(tokens?: Record<string, string>): string | null {
  if (!tokens || Object.keys(tokens).length === 0) return null;
  const body = Object.entries(tokens)
    .map(([k, v]) => `  ${k.startsWith("--") ? k : `--${k}`}: ${v};`)
    .join("\n");
  return `:root {\n${body}\n}`;
}

/**
 * Write the two appearance attributes as one coupled unit:
 *  - `data-theme` on `<html>` drives our own design tokens
 *  - `arco-theme` on `<body>` drives Arco's color scales
 */
function applyAppearanceAttributes(root: Document, appearance: Theme["appearance"]): void {
  root.documentElement.setAttribute("data-theme", appearance);
  if (root.body) {
    root.body.setAttribute("arco-theme", appearance);
    return;
  }
  root.addEventListener(
    "DOMContentLoaded",
    () => {
      root.body?.setAttribute("arco-theme", appearance);
    },
    { once: true }
  );
}

/** Apply a resolved theme — same contract as AionUi applyTheme */
export function applyTheme(theme: Theme, root: Document = document): void {
  applyAppearanceAttributes(root, theme.appearance);
  upsertStyle(TOKENS_STYLE_ID, tokensToCss(theme.tokens), root);
  upsertStyle(DECORATION_STYLE_ID, theme.css ? processCustomCss(theme.css) : null, root);
}

/** Clamp + apply UI zoom factor (AionUi default 0.95). Uses CSS zoom for Chromium/Electron. */
export function applyUiScale(factor: number, root: Document = document): void {
  const clamped = Math.min(
    MAX_UI_SCALE,
    Math.max(MIN_UI_SCALE, Number.isFinite(factor) ? factor : DEFAULT_UI_SCALE)
  );
  const rounded = Math.round(clamped * 100) / 100;
  root.documentElement.style.zoom = String(rounded);
  root.documentElement.style.setProperty("--ui-scale", String(rounded));
  root.documentElement.setAttribute("data-ui-scale", String(Math.round(rounded * 100)));
}

export function clampUiScale(factor: number): number {
  if (Number.isNaN(factor) || !Number.isFinite(factor)) return DEFAULT_UI_SCALE;
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Math.round(factor * 100) / 100));
}

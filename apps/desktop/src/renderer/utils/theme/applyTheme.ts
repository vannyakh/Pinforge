import type { Theme } from "@/common/theme/types";

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

function buildDecorationCss(theme: Theme): string | null {
  const parts: string[] = [];
  if (theme.backgroundImage) {
    const url = theme.backgroundImage.replace(/"/g, '\\"');
    parts.push(`
html body {
  background-image: url("${url}");
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}
.app-shell {
  background: transparent;
}
.layout-content,
.home-hero {
  background: color-mix(in srgb, var(--bg-1) 82%, transparent) !important;
}
.settings-shell .settings-aside {
  background: color-mix(in srgb, var(--bg-2) 88%, transparent);
}
`);
  }
  if (theme.css?.trim()) {
    parts.push(theme.css.trim());
  }
  return parts.length ? parts.join("\n") : null;
}

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
  upsertStyle(DECORATION_STYLE_ID, buildDecorationCss(theme), root);
}

export function applyUiScale(percent: number, root: Document = document): void {
  const clamped = Math.min(120, Math.max(80, Math.round(percent)));
  root.documentElement.style.setProperty("--ui-scale", String(clamped / 100));
  root.documentElement.style.fontSize = `${(16 * clamped) / 100}px`;
  root.documentElement.setAttribute("data-ui-scale", String(clamped));
}

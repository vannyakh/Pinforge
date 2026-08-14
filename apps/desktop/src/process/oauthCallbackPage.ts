import { readFileSync } from "node:fs";
import { join } from "node:path";

export type OAuthCallbackPageVariant =
  | "success"
  | "error"
  | "invalid"
  | "not_found"
  | "server_error";

export type OAuthCallbackPageOptions = {
  variant: OAuthCallbackPageVariant;
  title: string;
  message: string;
  /** e.g. "Facebook" — shown in success copy when provided. */
  providerLabel?: string;
};

let cachedLogoDataUri: string | undefined;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveLogoDataUri(): string {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  try {
    const iconPath = join(__dirname, "../../resources/icon.png");
    const buf = readFileSync(iconPath);
    cachedLogoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    cachedLogoDataUri = "";
  }
  return cachedLogoDataUri;
}

function statusGlyph(variant: OAuthCallbackPageVariant): string {
  switch (variant) {
    case "success":
      return "✓";
    case "error":
    case "invalid":
    case "server_error":
      return "!";
    case "not_found":
      return "?";
  }
}

function pageStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      min-height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      color: #c9cdd4;
      background:
        radial-gradient(ellipse 80% 60% at 50% 0%, rgba(61, 231, 255, 0.1), transparent 55%),
        linear-gradient(165deg, #0c121a 0%, #0a0e14 45%, #0e1520 100%);
    }
    .oauth-page {
      width: min(420px, 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      animation: oauth-fade-in 0.4s ease;
    }
    @keyframes oauth-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .oauth-brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      user-select: none;
    }
    .oauth-brand__logo {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      object-fit: contain;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }
    .oauth-brand__name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #f2f3f5;
    }
    .oauth-card {
      width: 100%;
      padding: 28px 24px 24px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(18, 18, 18, 0.72);
      backdrop-filter: blur(12px);
      text-align: center;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
    }
    .oauth-status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      margin-bottom: 16px;
      border-radius: 50%;
      font-size: 24px;
      font-weight: 700;
      line-height: 1;
    }
    .oauth-status--success {
      color: #00b42a;
      background: rgba(0, 180, 42, 0.14);
      border: 1px solid rgba(0, 180, 42, 0.35);
    }
    .oauth-status--error {
      color: #f53f3f;
      background: rgba(245, 63, 63, 0.12);
      border: 1px solid rgba(245, 63, 63, 0.32);
    }
    .oauth-status--neutral {
      color: #86909c;
      background: rgba(134, 144, 156, 0.12);
      border: 1px solid rgba(134, 144, 156, 0.28);
    }
    .oauth-card__title {
      margin-bottom: 8px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #f2f3f5;
    }
    .oauth-card__message {
      font-size: 14px;
      line-height: 1.55;
      color: #86909c;
    }
    .oauth-card__hint {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 12px;
      color: #6b7785;
    }
  `.trim();
}

export function renderOAuthCallbackPage(options: OAuthCallbackPageOptions): string {
  const { variant, title, message, providerLabel } = options;
  const logo = resolveLogoDataUri();
  const statusClass =
    variant === "success"
      ? "oauth-status--success"
      : variant === "error" || variant === "invalid" || variant === "server_error"
        ? "oauth-status--error"
        : "oauth-status--neutral";

  const hint =
    variant === "success"
      ? "You can close this tab and return to Pinforge."
      : "You can close this tab and try again from the app.";

  const logoMarkup = logo
    ? `<img class="oauth-brand__logo" src="${logo}" alt="" width="36" height="36" />`
    : `<span class="oauth-brand__logo" style="display:inline-flex;align-items:center;justify-content:center;background:#1a1a1a;color:#3de7ff;font-weight:700;">P</span>`;

  const providerNote =
    variant === "success" && providerLabel
      ? `<p class="oauth-card__message" style="margin-top:8px;">${escapeHtml(providerLabel)} account linked successfully.</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pinforge — ${escapeHtml(title)}</title>
  <style>${pageStyles()}</style>
</head>
<body>
  <main class="oauth-page">
    <header class="oauth-brand">
      ${logoMarkup}
      <span class="oauth-brand__name">Pinforge</span>
    </header>
    <section class="oauth-card">
      <div class="oauth-status ${statusClass}" aria-hidden="true">${statusGlyph(variant)}</div>
      <h1 class="oauth-card__title">${escapeHtml(title)}</h1>
      <p class="oauth-card__message">${escapeHtml(message)}</p>
      ${providerNote}
      <p class="oauth-card__hint">${escapeHtml(hint)}</p>
    </section>
  </main>
</body>
</html>`;
}

export function oauthSuccessPage(providerLabel: string): string {
  return renderOAuthCallbackPage({
    variant: "success",
    title: "Connected",
    message: "Authorization received.",
    providerLabel,
  });
}

export function oauthErrorPage(title: string, message: string): string {
  return renderOAuthCallbackPage({
    variant: "error",
    title,
    message,
  });
}

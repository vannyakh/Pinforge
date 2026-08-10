<div align="center">

<img src="resources/icon.png" alt="Pinforge" width="128" height="128" />

# Pinforge

Download and organize media from YouTube, Pinterest, Instagram, TikTok, Facebook, and more — all on your machine, with optional enhancement and batch workflows.

For personal use. Always follow each site’s terms and rate limits.

[Setup](#setup) · [Providers](#providers) · [CLI](#cli) · [Contributing](CONTRIBUTING.md)

</div>

## Setup

```bash
pnpm install
pnpm --filter @pinterest-desktop/core exec playwright install chromium
pnpm --filter desktop run dev
```
## CLI

```bash
pnpm --filter pinforge-cli start -- providers
pnpm --filter pinforge-cli start -- interactive
pnpm --filter pinforge-cli start -- "https://www.youtube.com/watch?v=…" -o ./downloads -f mp4
pnpm --filter pinforge-cli start -- "https://www.pinterest.com/pin/…" -o ./downloads --enhance auto
```

Root shortcut: `pnpm cli -- providers`

## Layout

```
apps/desktop/     Electron (AionUi-style shell + settings sidebar)
apps/cli/         pinforge CLI
packages/core/    provider registry + extractors + processMedia + enhance
resources/        App icon and shared assets
```

## Scripts

| Command | What |
|---|---|
| `pnpm --filter desktop run dev` | Desktop HMR |
| `pnpm cli -- <args>` | CLI |
| `pnpm build` | Build workspace |
| `pnpm package` | electron-builder |

# Pinforge

Local multi-source media downloader: **Electron desktop** + **CLI**, shared `@pinterest-desktop/core`.

Personal / local use only. Respect site terms and rate limits.

See [CONTRIBUTING.md](CONTRIBUTING.md) / [AGENTS.md](AGENTS.md) for local setup conventions.

## Setup

```bash
pnpm install
pnpm --filter @pinterest-desktop/core exec playwright install chromium
pnpm --filter desktop run dev
```

**No yt-dlp.** YouTube uses a built-in JS extractor (optional Piped URL in Settings). Instagram / TikTok / Pinterest use fetch first, then **Playwright** Chromium to scrape Open Graph meta on SPA pages.

## Providers

| Provider | Status | Notes |
|---|---|---|
| Pinterest | Live | Pins, boards, carousels; sharp enhance; HLS resume |
| YouTube | Live | Built-in JS extractor (`best` / `mp4` / `audio-only`); playlists & channels |
| Instagram | Live | Public posts / reels / carousels; Playwright meta fallback |
| TikTok | Live | Public videos & photo posts; profile batch |
| Facebook | Live | Public videos / Watch / photos (no login) |

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
```

## Scripts

| Command | What |
|---|---|
| `pnpm --filter desktop run dev` | Desktop HMR |
| `pnpm cli -- <args>` | CLI |
| `pnpm build` | Build workspace |
| `pnpm package` | electron-builder |

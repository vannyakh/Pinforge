<div align="center">

<img src="resources/icon.png" alt="Pinforge" width="128" height="128" />

# Pinforge

Download and organize media from YouTube, Pinterest, Instagram, TikTok, Facebook, and more — all on your machine, with optional enhancement and batch workflows.

For personal use. Always follow each site’s terms and rate limits.

<p>
  <a href="https://github.com/vannyakh/Pinforge/stargazers"><img src="https://img.shields.io/github/stars/vannyakh/Pinforge?style=flat&logo=github&label=Stars" alt="GitHub Stars" /></a>
  <a href="https://github.com/vannyakh/Pinforge/network/members"><img src="https://img.shields.io/github/forks/vannyakh/Pinforge?style=flat&logo=github&label=Forks" alt="GitHub Forks" /></a>
  <a href="https://github.com/vannyakh/Pinforge/issues"><img src="https://img.shields.io/github/issues/vannyakh/Pinforge?style=flat&logo=github&label=Issues" alt="GitHub Issues" /></a>
  <a href="https://github.com/vannyakh/Pinforge/pulls"><img src="https://img.shields.io/github/issues-pr/vannyakh/Pinforge?style=flat&logo=github&label=PRs" alt="Pull Requests" /></a>
  <a href="https://github.com/vannyakh/Pinforge/releases/latest"><img src="https://img.shields.io/github/v/release/vannyakh/Pinforge?style=flat&label=Release" alt="Latest Release" /></a>
  <br />
  <a href="https://github.com/vannyakh/Pinforge/actions/workflows/pr-checks.yml"><img src="https://img.shields.io/github/actions/workflow/status/vannyakh/Pinforge/pr-checks.yml?branch=main&style=flat&label=PR%20Checks" alt="PR Checks" /></a>
  <a href="https://github.com/vannyakh/Pinforge/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/vannyakh/Pinforge/release.yml?style=flat&label=Release%20Build" alt="Release Build" /></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributing-welcome-brightgreen?style=flat&logo=git" alt="Contributing" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat" alt="Platforms" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-green?style=flat&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/pnpm-9-orange?style=flat&logo=pnpm&logoColor=white" alt="pnpm" />
</p>

[Setup](#setup) · [CLI](#cli) · [Contributing](CONTRIBUTING.md) · [Releases](https://github.com/vannyakh/Pinforge/releases)

</div>

## Setup

```bash
pnpm install
pnpm --filter @pinforge/core exec playwright install chromium
pnpm --filter desktop run dev
```

## macOS note (Intel & Apple Silicon)

Release builds are **not Apple-notarized** yet, so Gatekeeper may show _“Apple could not verify Pinforge…”_ (common on Intel x64). That is unsigned CI, not malware.

**Open anyway (one-time):**

1. Right-click the app → **Open** → **Open**, or
2. **System Settings → Privacy & Security → Open Anyway**, or
3. In Terminal (after mounting the DMG / unzipping):

```bash
xattr -cr /Applications/Pinforge.app
# or the path to Pinforge.app from the DMG/zip
open /Applications/Pinforge.app
```

Use the `*-x64.dmg` / `*-x64.zip` asset on Intel Macs, and `*-arm64.*` on Apple Silicon.

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

| Command                         | What             |
| ------------------------------- | ---------------- |
| `pnpm --filter desktop run dev` | Desktop HMR      |
| `pnpm cli -- <args>`            | CLI              |
| `pnpm build`                    | Build workspace  |
| `pnpm package`                  | electron-builder |

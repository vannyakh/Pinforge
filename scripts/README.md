# Build Scripts

Adapted from [AionUi](https://github.com/iOfficeAI/AionUi) `scripts/` for Pinforge’s pnpm monorepo (`apps/desktop`).

## Overview

| Script                    | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `build-with-builder.js`   | electron-vite → electron-builder coordinator |
| `rebuildNativeModules.js` | Rebuild / verify `sharp` native binaries     |
| `afterPack.js`            | electron-builder afterPack hook              |
| `afterSign.js`            | macOS notarization (optional credentials)    |

## Flow

```
pnpm dist:win | dist:mac | dist:linux
    ↓
scripts/build-with-builder.js
    ↓
electron-vite build  (apps/desktop → out/)
    ↓
electron-builder     (apps/desktop → release/)
    ↓
afterPack.js  → verify/rebuild sharp when needed
afterSign.js  → notarize on macOS when appleId is set
```

## Commands

```bash
# Current platform (pass through builder flags)
pnpm dist -- --win

# Explicit targets
pnpm dist:win
pnpm dist:mac
pnpm dist:linux

# Faster local iteration
node scripts/build-with-builder.js auto --win --skip-vite
node scripts/build-with-builder.js auto --win --force
node scripts/build-with-builder.js auto --win --pack-only
node scripts/build-with-builder.js auto --win --skip-native
```

## Native modules

Pinforge packs **`sharp`** (image enhance). Binaries must live outside the ASAR (`asarUnpack`).

- Same-arch macOS/Linux: rebuild usually skipped (set `FORCE_NATIVE_REBUILD=true` to force).
- Windows / cross-arch: `afterPack` attempts rebuild via `prebuild-install` → `electron-rebuild`.

Playwright Chromium is **not** bundled (size). Users / CI should run:

```bash
pnpm --filter @pinterest-desktop/core exec playwright install chromium
```

## Artifacts

| Path                    | Contents              |
| ----------------------- | --------------------- |
| `apps/desktop/out/`     | Vite main/preload/UI  |
| `apps/desktop/release/` | Installers / unpacked |

## Icons & DMG background

Add `apps/desktop/resources/icon.png` (and `.ico` / `.icns` if desired) before shipping branded installers. Builds work without custom icons (Electron default).

macOS DMG drag-to-Applications art:

| File | Size |
| --- | --- |
| `apps/desktop/resources/background.png` | 540×380 |
| `apps/desktop/resources/background@2x.png` | 1080×760 (Retina) |

Configured in `electron-builder.yml` → `dmg.background` / `dmg.contents` (app at 140,180 → Applications at 400,180).

## CI / Release

| Workflow                             | Trigger                            | What it does                                                                                                                |
| ------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release.yml`      | Push tag `v*` (or manual dispatch) | Cross-platform build (Windows x64, macOS arm64/x64, Linux x64) → draft Release → upload assets + `SHA256SUMS.txt` → publish |
| `.github/workflows/build-manual.yml` | `workflow_dispatch`                | Same platform matrix; uploads Actions artifacts only (no GitHub Release)                                                    |

Release checklist:

1. Set package versions (`apps/desktop`, `apps/cli`, `packages/core`) to the release version (e.g. `0.1.1`).
2. Ensure **PR Checks** is green (`pnpm format:check`, `pnpm typecheck`, `pnpm test`).
3. Commit and push to the default branch.
4. Tag and push: `git tag v0.1.1 && git push origin v0.1.1`
5. Watch **Release** workflow; GitHub Release is published when all platform jobs finish.

### macOS signing / Gatekeeper

Unsigned builds trigger Gatekeeper (“Apple could not verify…”). Users can clear quarantine with `xattr -cr Pinforge.app` (see root README).

**Step-by-step Apple cert + secrets + env:** [.github/APPLE_SIGNING.md](../.github/APPLE_SIGNING.md)

When `CSC_LINK` is set, `release.yml` enables signing; `afterSign.js` notarizes with `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`.

## Related

- `apps/desktop/electron-builder.yml`
- `apps/desktop/electron.vite.config.ts`
- `.github/workflows/release.yml`
- `.github/workflows/build-manual.yml`

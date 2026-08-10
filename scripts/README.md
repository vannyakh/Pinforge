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

## Icons

Add `apps/desktop/resources/icon.png` (and `.ico` / `.icns` if desired) before shipping branded installers. Builds work without custom icons (Electron default).

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

Unsigned CI builds set `CSC_IDENTITY_AUTO_DISCOVERY=false`, so downloaded apps trigger Gatekeeper (“Apple could not verify…”). Users can clear quarantine with `xattr -cr Pinforge.app` (see root README).

To ship notarized builds, add GitHub secrets and a Developer ID cert:

| Secret | Purpose |
| --- | --- |
| `CSC_LINK` | Base64 `.p12` Developer ID Application cert |
| `CSC_KEY_PASSWORD` | Password for that `.p12` |
| `APPLE_ID` | Apple ID for notarytool |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Team ID |

Then set `CSC_IDENTITY_AUTO_DISCOVERY=true` (or remove the override) on the macOS release jobs so electron-builder signs and `afterSign.js` can notarize.

## Related

- `apps/desktop/electron-builder.yml`
- `apps/desktop/electron.vite.config.ts`
- `.github/workflows/release.yml`
- `.github/workflows/build-manual.yml`

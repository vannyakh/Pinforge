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

| Path                         | Contents                |
| ---------------------------- | ----------------------- |
| `apps/desktop/out/`          | Vite main/preload/UI    |
| `apps/desktop/release/`      | Installers / unpacked   |

## Icons

Add `apps/desktop/resources/icon.png` (and `.ico` / `.icns` if desired) before shipping branded installers. Builds work without custom icons (Electron default).

## Related

- `apps/desktop/electron-builder.yml`
- `apps/desktop/electron.vite.config.ts`
- `.github/workflows/release.yml`

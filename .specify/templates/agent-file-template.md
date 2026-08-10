# Pinforge Development Guidelines

Auto-generated from feature plans. Last updated: 2026-08-10

## Active Technologies

- TypeScript 5.x, Node 22, Electron 31
- React 18, Arco Design, UnoCSS, IconPark
- pnpm workspaces + turbo
- electron-vite, electron-builder
- sharp (enhance), Playwright Chromium (SPA meta fallback)
- Shared core: `@pinterest-desktop/core`

## Project Structure

```
apps/desktop/     Electron main / preload / renderer
apps/cli/         pinforge CLI
packages/core/    providers, download, enhance
scripts/          packaging helpers
```

## Commands

```bash
pnpm install
pnpm --filter @pinterest-desktop/core exec playwright install chromium
pnpm --filter desktop run dev
pnpm cli -- providers
pnpm typecheck
pnpm format
pnpm dist:win   # or dist:mac / dist:linux
```

## Code Style

- TypeScript strict; prefer explicit types over `any`
- English for user-facing copy and commits
- Conventional Commits; atomic PRs
- Respect Electron process boundaries (see AGENTS.md)

## Recent Changes

- Aligned `.github` / `.specify` with Pinforge (pnpm, English-only)
- Packaging via `scripts/build-with-builder.js`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

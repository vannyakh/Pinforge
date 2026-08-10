# Pinforge Constitution

## Core Principles

### I. Local-first media tooling

Pinforge is a local desktop + CLI downloader for public media (Pinterest, YouTube, Instagram, TikTok, Facebook). Features must:

- Prefer fetch / public APIs before browser automation
- Respect site terms, rate limits, and user privacy (no cloud accounts required for core download)
- Keep Playwright as a fallback for SPA Open Graph scrape, not the default path
- Remain usable offline for already-queued local work where practical

### II. Process boundaries

Electron multi-process rules are non-negotiable:

- **Main** (`apps/desktop/src/process`, `apps/desktop/src/index.ts`): Node + Electron APIs only — no DOM
- **Preload** (`apps/desktop/src/preload`): thin `contextBridge` only
- **Renderer** (`apps/desktop/src/renderer`): React UI — call `window.api` / `@renderer/api`, never Node APIs directly
- Shared download/provider logic lives in `packages/core`, not duplicated in the UI

### III. Modular providers

Each media provider is an independent, testable module under `packages/core`:

- Clear extract → resolve → download pipeline
- Shared enhance (sharp) and download engines
- Desktop and CLI consume the same core APIs

### IV. User experience

- English user-facing copy (no i18n layer yet)
- Clear task progress, errors, and settings
- Arco Design + UnoCSS + IconPark for consistent UI

### V. Maintainability

- TypeScript strict; prefer explicit types over `any`
- Atomic PRs; Conventional Commits (`feat:`, `fix:`, `chore:`, …)
- Document architecture in `AGENTS.md` / `CONTRIBUTING.md`

## Technology Standards

### Packaging

- `electron-vite` for main / preload / renderer bundles
- `electron-builder` via `scripts/build-with-builder.js`
- Native modules (especially `sharp`) must be listed in `asarUnpack`
- Playwright Chromium is **not** shipped inside the installer by default

### Monorepo

| Path | Role |
| --- | --- |
| `apps/desktop/` | Electron app |
| `apps/cli/` | CLI |
| `packages/core/` | Shared providers, download, enhance |
| `scripts/` | Build and packaging helpers |

### Package manager

- **pnpm** workspaces + turbo — do not introduce bun/npm lockfiles

## Development Workflow

### Quality gates

- `pnpm typecheck` and `pnpm format:check` before merge
- No secrets or `.env*` in commits
- Do not commit `.tmp-aionui/`, `node_modules/`, `out/`, `release/`, `dist/`

### Versioning

- Semantic versioning on `apps/desktop/package.json`
- Releases via `v*` tags and `.github/workflows/release.yml`

### Branching

- Feature branches → pull requests into the default branch
- Reviews required for substantive changes

## Governance

- Constitutional process-boundary rules override convenience shortcuts
- New providers must plug into `packages/core` patterns
- Breaking packaging or IPC changes need a short migration note in the PR
- Cross-platform support (Windows, macOS, Linux) is the default expectation for desktop features

**Version**: 1.0.0 | **Ratified**: 2026-08-10 | **Last Amended**: 2026-08-10

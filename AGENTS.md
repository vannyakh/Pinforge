# Pinforge — agent / contributor guide

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for PRs and commits.

## Layout

| Path                  | Role                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------ |
| `apps/desktop/`       | Electron app (main / preload / renderer)                                             |
| `apps/cli/`           | CLI                                                                                  |
| `packages/core/`      | Thin `@pinforge/core` façade (`process`, `preview`, `zip`)                           |
| `packages/api/`       | App-level helpers shared by CLI + desktop (provider prefs/resolve, download options) |
| `packages/common/`    | Cross-package shared helpers (`@pinforge/common` — URL scrape utils, etc.)           |
| `packages/providers/` | Site providers + registry                                                            |
| `packages/download/`  | HTTP/range/segment/HLS download                                                      |
| `packages/engine/`    | MediaCore, jobs, storage                                                             |
| `packages/enhance/`   | Image enhance pipeline                                                               |
| `packages/types/`     | Shared domain types + utils                                                          |
| `packages/tools/`     | ffmpeg / yt-dlp binary resolve                                                       |
| `packages/worker/`    | Rust worker bridge                                                                   |
| `rust/`               | Optional native worker                                                               |

## Shared library (`@pinforge/*`)

Apps prefer façade subpaths; API can also be imported directly:

| Import                     | Package                                     |
| -------------------------- | ------------------------------------------- |
| `@pinforge/core/types`     | `@pinforge/types`                           |
| `@pinforge/core/providers` | `@pinforge/providers`                       |
| `@pinforge/core/process`   | local orchestration                         |
| `@pinforge/core/preview`   | local preview                               |
| `@pinforge/core/download`  | `@pinforge/download`                        |
| `@pinforge/core/engine`    | `@pinforge/engine` (+ wired `processMedia`) |
| `@pinforge/core/jobs`      | `@pinforge/engine`                          |
| `@pinforge/core/pipeline`  | `@pinforge/enhance`                         |
| `@pinforge/core/tools`     | `@pinforge/tools`                           |
| `@pinforge/core/worker`    | `@pinforge/worker`                          |
| `@pinforge/core/api`       | `@pinforge/api` (alias)                     |
| `@pinforge/core/common`    | `@pinforge/common`                          |
| `@pinforge/api/providers`  | provider prefs / resolve                    |
| `@pinforge/api/download`   | `normalizeDownloadOptions`                  |

No shared `@pinforge/ui` — React UI stays in `apps/desktop`. Electron IPC/store stay in desktop.

Provider side-effect registration runs on `@pinforge/providers` / `@pinforge/core/providers` and the root `@pinforge/core` barrel.

## Process boundaries

- **Main** (`apps/desktop/src/process`, `apps/desktop/src/index.ts`): Node + Electron APIs only — no DOM
- **Preload** (`apps/desktop/src/preload`): thin `contextBridge` API only
- **Renderer** (`apps/desktop/src/renderer`): React UI — call `window.api` / `@renderer/api`, never Node APIs directly

## UI stack

- Components: `@arco-design/web-react`
- Icons: `@icon-park/react`
- Shared modal: `@renderer/components/base/AionModal`
- Utilities: UnoCSS + `layout.css` / `arco-override.css` tokens

## Conventions

- TypeScript strict; prefer explicit types over `any`
- Path aliases: `@renderer/*`, `@common/*`, `@/` (desktop), `@pinforge/core` (+ subpaths), `@pinforge/api`
- English for user-facing copy (no i18n layer yet)
- Atomic PRs; Conventional Commits (`feat:`, `fix:`, `chore:`, …)

## Local commands

```bash
pnpm install
pnpm --filter @pinforge/providers exec playwright install chromium
pnpm --filter desktop run dev
pnpm typecheck
pnpm format

# Distributables (see scripts/README.md)
pnpm dist:win
pnpm dist:mac
pnpm dist:linux
```

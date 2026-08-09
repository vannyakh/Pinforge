# Pinforge — agent / contributor guide

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for PRs and commits.

## Layout

| Path | Role |
| --- | --- |
| `apps/desktop/` | Electron app (main / preload / renderer) |
| `apps/cli/` | CLI |
| `packages/core/` | Shared providers, download, enhance |
| `rust/` | Optional native worker |

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
- Path aliases: `@renderer/*`, `@common/*`, `@/` (desktop), `@pinterest-desktop/core`
- English for user-facing copy (no i18n layer yet)
- Atomic PRs; Conventional Commits (`feat:`, `fix:`, `chore:`, …)

## Local commands

```bash
pnpm install
pnpm --filter @pinterest-desktop/core exec playwright install chromium
pnpm --filter desktop run dev
pnpm typecheck
pnpm format
```

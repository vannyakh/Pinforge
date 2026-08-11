# Project Layout

## Root Directory

### Rules

- **Workspace root stays minimal**: root keeps shared config, scripts, tests, docs, assets, and package manager files.
- **Desktop app source lives under `apps/desktop/`**.
- **Shared media logic is split under `packages/@pinforge/*`** with a thin `@pinforge/core` façade. Prefer façade subpaths from apps.
- Cross-cutting helpers (URL scrape utils, etc.) live in `packages/common` (`@pinforge/common`).
- **README translations** → `docs/readme/`, not root. Only main `readme.md` stays at root.
- **Guide documents** (`*_GUIDE.md`, `CODE_STYLE.md`) → `docs/`
- **Build artifacts** (`out/`, `node_modules/`) are gitignored

### Current Root Structure

```
project-root/
├── apps/
│   ├── desktop/            # Electron desktop app
│   └── cli/                # pinforge CLI
├── packages/
│   ├── core/               # @pinforge/core façade
│   ├── api/                # @pinforge/api (CLI + desktop helpers)
│   ├── common/             # @pinforge/common (shared helpers)
│   ├── providers/          # @pinforge/providers
│   ├── download/           # @pinforge/download
│   ├── engine/             # @pinforge/engine
│   ├── enhance/            # @pinforge/enhance
│   ├── types/              # @pinforge/types
│   ├── tools/              # @pinforge/tools
│   └── worker/             # @pinforge/worker
├── rust/                   # Optional native worker
├── tests/                  # Shared test suites
├── docs/                   # Documentation
├── scripts/                # Build and tooling scripts
├── patches/                # npm/pnpm patches
├── package.json            # Workspace root config
├── AGENTS.md               # Agent conventions
└── ...
```

---

## `apps/desktop/` Layout

### Workspace Structure

```
apps/desktop/
├── src/
│   ├── renderer/          # Renderer layer — React UI, no Node.js APIs
│   ├── process/           # Main process layer — Node.js / Electron business logic
│   ├── common/            # Shared cross-process code
│   ├── preload/           # IPC bridge entrypoints
│   ├── index.ts           # Main process entry
│   └── types.d.ts         # Ambient declarations
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

### Placement Rules

- New Electron runtime code belongs in `apps/desktop/src/**`.
- Shared media/download logic belongs in the owning `@pinforge/*` package (apps import via `@pinforge/core/<subpath>`).
- Root-level scripts and config may reference `apps/desktop/**`, but should not duplicate app source.
- Tests remain under `tests/**` or package-local `tests/` and should reference source through package names or aliases.

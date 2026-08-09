# Contributing to Pinforge

Repo: [github.com/vannyakh/Pinforge](https://github.com/vannyakh/Pinforge)

## Prerequisites

- Node.js 20+ (22 recommended)
- [pnpm](https://pnpm.io) 9.15+ (`packageManager` in root `package.json`)
- Optional: [Rust](https://rustup.rs) for `rust/` worker

## Setup

```bash
pnpm install
pnpm --filter @pinterest-desktop/core exec playwright install chromium
pnpm --filter desktop run dev
```

CLI: `pnpm cli -- providers`

## Rules

1. **Atomic PRs** — one feature or one bug fix per PR when possible.
2. **Conventional Commits** (English):

   ```text
   <type>(<scope>): <subject>
   ```

   Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`.

3. **Do not commit** `.tmp-aionui/`, `node_modules/`, `out/`, `dist/`, `.env*`, or `rust/target/`.
4. Run `pnpm typecheck` before opening a PR. Prefer `pnpm format` for Prettier.

## Architecture notes

See [AGENTS.md](AGENTS.md) for main/preload/renderer boundaries and UI stack.

# Legacy Node packages (do not use from apps)

`apps/desktop` executes downloads/jobs/remote through **`pinforge-server` (Rust)** via `@pinforge/worker`.
Headless CLI: **`pinforge`** / **`pinforge-worker`** in `rust/crates/worker` (same binary) — no Node `apps/cli`.

These packages remain only as **temporary** dependencies for extract-preview / provider registry until those move to Rust:

| Package | Status |
|---------|--------|
| `packages/download` | LEGACY — do not call from apps for downloads |
| `packages/engine` | LEGACY — MediaCore removed from desktop |
| `packages/enhance` | LEGACY — prefer `enhance.run` on server |
| `packages/core` `process.ts` | LEGACY — CLI/desktop no longer call `processMedia` |

New service logic → `rust/crates/*` only (`features` = 134-feature catalog + scrape options). See `.cursor/rules/rust-server-client.mdc`.

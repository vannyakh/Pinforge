# Legacy Node packages (do not use from apps)

`apps/desktop` and `apps/cli` execute downloads/jobs/remote through **`pinforge-server` (Rust)** via `@pinforge/worker`.

These packages remain only as **temporary** dependencies for extract-preview / provider registry until those move to Rust:

| Package | Status |
|---------|--------|
| `packages/download` | LEGACY — do not call from apps for downloads |
| `packages/engine` | LEGACY — MediaCore removed from desktop |
| `packages/enhance` | LEGACY — prefer `enhance.run` on server |
| `packages/core` `process.ts` | LEGACY — CLI/desktop no longer call `processMedia` |

New service logic → `rust/crates/*` only. See `.cursor/rules/rust-server-client.mdc`.

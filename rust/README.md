# rust/

Shared Rust crates that power Pinforge download + enhance workers
([OpenCut-style](https://github.com/OpenCut-app/opencut-classic/tree/main/rust) layout).

Desktop Electron calls the `pinforge-worker` CLI; TypeScript falls back to sharp / fetch
when the binary is missing.

## Layout

```
rust/
  Cargo.toml              # workspace
  crates/
    bridge/               # shared surface helpers
    enhance/              # image enhance pipeline (CPU)
    download/             # multi-connection Range downloads (Tokio)
    worker/               # pinforge-worker CLI binary
```

## Build

Requires [Rust](https://rustup.rs/) (`rustc` + `cargo`).

```bash
cd rust
cargo build -p pinforge-worker --release
```

Binary:

- Windows: `rust/target/release/pinforge-worker.exe`
- macOS/Linux: `rust/target/release/pinforge-worker`

Optional: set `PINFORGE_WORKER` to an absolute path.

## CLI

```bash
pinforge-worker ping
pinforge-worker enhance --preset auto --input in.jpg --output out.png
pinforge-worker download --url https://… --out file.mp4 --concurrency 4
```

All commands print a single JSON line: `{ "ok": true, "data": … }`.

## How Electron uses it

`packages/core` resolves the worker binary and:

1. **Enhance** — `runPipeline` prefers Rust, else sharp
2. **Download** — `downloadToFile` prefers Rust fragment engine, else TS Range pool

## Testing

```bash
cargo test -p enhance
cargo test -p download
cargo run -p pinforge-worker -- ping
```

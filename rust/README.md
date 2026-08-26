# rust/

Shared Rust crates that power Pinforge download, enhance, jobs, and the desktop app server
([OpenCut-style](https://github.com/OpenCut-app/opencut-classic/tree/main/rust) layout).

Electron keeps a thin main process (window / dialogs / updater). Business services run in
the long-lived **`pinforge-server`** binary (JSON-RPC over stdio). React UI is unchanged.

## Layout

```
rust/
  Cargo.toml              # workspace
  crates/
    bridge/               # shared surface helpers
    enhance/              # image enhance pipeline (CPU)
    download/             # multi-connection Range downloads (Tokio)
    engine/               # job queue + JSON persistence
    settings/             # service settings JSON store
    providers/            # URL detect + yt-dlp / ffmpeg spawn
    remote/               # localhost HTTP remote API (Axum)
    server/               # pinforge-server JSON-RPC binary
    worker/               # pinforge / pinforge-worker CLI (headless server client)
```

## Build

Requires [Rust](https://rustup.rs/) (`rustc` + `cargo`).

```bash
cd rust
cargo build -p pinforge-server --release
cargo build -p pinforge-worker --release
```

Or from the repo root (also stages into `apps/desktop/resources/bin/`):

```bash
node scripts/build-rust-server.js
```

Binaries:

- Windows: `rust/target/release/pinforge-server.exe`, `pinforge.exe`, `pinforge-worker.exe`
- macOS/Linux: `rust/target/release/pinforge-server`, `pinforge`, `pinforge-worker`

Env overrides:

- `PINFORGE_SERVER` — absolute path to server binary
- `PINFORGE_WORKER` — absolute path to worker CLI
- `PINFORGE_DATA_DIR` — server data directory (default: app userData/server)
- `PINFORGE_YTDLP` / `PINFORGE_FFMPEG` — tool paths

## pinforge-server protocol

Newline-delimited JSON-RPC on stdin/stdout:

```json
{"id":"1","method":"ping","params":{}}
{"id":"1","ok":true,"result":{"enhance":"enhance-ok",…}}
{"event":"download.progress","payload":{"percent":42}}
```

Core methods: `ping`, `shutdown`, `enhance.run`, `download.run`, `jobs.*`, `media.process`,
`settings.get` / `settings.set`, `providers.list` / `providers.detect`, `tools.*`,
`remote.start` / `remote.stop`.

## pinforge CLI (headless client)

Spawns `pinforge-server`, issues one RPC, then shuts down. Same binary as `pinforge-worker`.

```bash
pinforge ping
pinforge providers
pinforge detect --url "https://youtube.com/watch?v=…"
pinforge features --summary
pinforge process --url "https://…" -o ./downloads
pinforge drama-scrape --url "https://www.dramabox.com/doc/41000122939"
pinforge enhance --preset auto --input in.jpg --output out.png
pinforge download --url https://… --out file.mp4 --concurrency 4
```

Set `PINFORGE_JSON=1` for machine-readable output on `providers`.

## How Electron uses it

1. On `app.ready`, main spawns `pinforge-server` (`apps/desktop/src/process/pinforgeServer.ts`)
2. `@pinforge/worker` routes enhance/download through the server when running
3. IPC `jobs:*` / remote HTTP prefer the Rust server; Node MediaCore remains fallback
4. Dist builds copy binaries via `extraResources` → `resources/bin/`

## Testing

```bash
cargo test -p enhance
cargo test -p download
cargo test -p pinforge-engine
cargo run -p pinforge-worker -- ping
# Interactive: echo a ping request into the server
cargo run -p pinforge-server
```

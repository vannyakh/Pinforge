#!/usr/bin/env node
/**
 * Build pinforge-server (+ pinforge-worker) and stage into apps/desktop/resources/bin
 * for electron-builder extraResources.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RUST = path.join(ROOT, "rust");
const TARGET = path.join(RUST, "target");
const OUT_BIN = path.join(ROOT, "apps", "desktop", "resources", "bin");

const isWin = process.platform === "win32";
const serverName = isWin ? "pinforge-server.exe" : "pinforge-server";
const workerName = isWin ? "pinforge-worker.exe" : "pinforge-worker";

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, {
    stdio: "inherit",
    shell: true,
    cwd: RUST,
    env: {
      ...process.env,
      // Keep artifacts in-repo so Electron / staging can find them
      CARGO_TARGET_DIR: TARGET,
    },
  });
}

function main() {
  if (process.env.SKIP_RUST_BUILD === "true") {
    console.log("⚡ SKIP_RUST_BUILD=true — skipping Rust server build");
    return;
  }

  run("cargo build -p pinforge-server --release");
  run("cargo build -p pinforge-worker --release");

  fs.mkdirSync(OUT_BIN, { recursive: true });
  const release = path.join(TARGET, "release");
  for (const name of [serverName, workerName]) {
    const src = path.join(release, name);
    const dest = path.join(OUT_BIN, name);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing Rust binary: ${src}`);
    }
    fs.copyFileSync(src, dest);
    console.log(`📦 Staged ${name} → ${dest}`);
  }
}

main();

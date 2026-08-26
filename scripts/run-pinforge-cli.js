#!/usr/bin/env node
/**
 * Dev wrapper: run Rust `pinforge` CLI (talks to pinforge-server).
 * Build first: node scripts/build-rust-server.js
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const names = isWin
  ? ["pinforge.exe", "pinforge-worker.exe"]
  : ["pinforge", "pinforge-worker"];

const candidates = [
  process.env.PINFORGE_CLI,
  ...names.flatMap((name) => [
    path.join(ROOT, "apps", "desktop", "resources", "bin", name),
    path.join(ROOT, "rust", "target", "release", name),
    path.join(ROOT, "rust", "target", "debug", name),
  ]),
].filter(Boolean);

const bin = candidates.find((p) => fs.existsSync(p));
if (!bin) {
  console.error(
    "pinforge CLI not found. Run: node scripts/build-rust-server.js"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const result = spawnSync(bin, args, { stdio: "inherit", shell: isWin });
process.exit(result.status ?? 1);

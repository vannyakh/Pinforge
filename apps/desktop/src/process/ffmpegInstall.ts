import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { app } from "electron";
import { getStore } from "./store";

export type FfmpegStatus = {
  available: boolean;
  enabled: boolean;
  path: string;
  version?: string;
  source: "custom" | "bundled" | "path" | "none";
  installing: boolean;
};

let installing = false;

function bundledFfmpegDir(): string {
  return path.join(app.getPath("userData"), "tools", "ffmpeg");
}

function bundledFfmpegBin(): string {
  return path.join(bundledFfmpegDir(), process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
}

async function probeBinary(bin: string): Promise<{ ok: boolean; version?: string }> {
  if (!bin.trim()) return { ok: false };
  try {
    await fs.access(bin);
  } catch {
    // May still be on PATH (no absolute path)
    if (path.isAbsolute(bin)) return { ok: false };
  }
  return await new Promise((resolve) => {
    const child = spawn(bin, ["-version"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.on("error", () => resolve({ ok: false }));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false });
        return;
      }
      const version = out.split(/\r?\n/)[0]?.trim();
      resolve({ ok: true, version });
    });
  });
}

export async function getFfmpegStatus(): Promise<FfmpegStatus> {
  const system = getStore().get("system");
  const custom = (system.ffmpegPath ?? "").trim();
  const enabled = Boolean(system.ffmpegEnabled);

  if (custom) {
    const probe = await probeBinary(custom);
    if (probe.ok) {
      return {
        available: true,
        enabled,
        path: custom,
        version: probe.version,
        source: "custom",
        installing,
      };
    }
  }

  const bundled = bundledFfmpegBin();
  {
    const probe = await probeBinary(bundled);
    if (probe.ok) {
      return {
        available: true,
        enabled,
        path: bundled,
        version: probe.version,
        source: "bundled",
        installing,
      };
    }
  }

  for (const bin of process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"]) {
    const probe = await probeBinary(bin);
    if (probe.ok) {
      return {
        available: true,
        enabled,
        path: bin,
        version: probe.version,
        source: "path",
        installing,
      };
    }
  }

  return {
    available: false,
    enabled: false,
    path: "",
    source: "none",
    installing,
  };
}

/** Effective binary for tools — only when enabled + available. */
export async function resolveConfiguredFfmpeg(): Promise<string | null> {
  const status = await getFfmpegStatus();
  if (!status.available || !status.enabled) return null;
  return status.path || null;
}

async function downloadToFile(
  url: string,
  dest: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length") ?? 0);
  await fs.mkdir(path.dirname(dest), { recursive: true });

  let downloaded = 0;
  const nodeStream = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  const out = createWriteStream(dest);
  nodeStream.on("data", (chunk: Buffer) => {
    downloaded += chunk.length;
    if (total > 0) onProgress?.(Math.min(99, Math.round((downloaded / total) * 100)));
  });
  await pipeline(nodeStream, out);
  onProgress?.(100);
}

async function extractZipWindows(zipPath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const ps = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let err = "";
    ps.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });
    ps.on("error", reject);
    ps.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `Expand-Archive exited ${code}`));
    });
  });
}

async function findFfmpegInDir(root: string): Promise<string | null> {
  const name = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const queue = [root];
  while (queue.length) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return full;
      if (e.isDirectory()) queue.push(full);
    }
  }
  return null;
}

function downloadUrlForPlatform(): string {
  if (process.platform === "win32") {
    // Essentials build (smaller) from gyan.dev
    return "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
  }
  if (process.platform === "linux") {
    return "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz";
  }
  // macOS: recommend brew; no automatic large download for now
  throw new Error(
    "Automatic ffmpeg install is supported on Windows. On macOS use: brew install ffmpeg"
  );
}

export type FfmpegInstallProgress = {
  phase: "download" | "extract" | "done" | "error";
  percent: number;
  message: string;
};

/**
 * Download and install ffmpeg into userData/tools/ffmpeg.
 * Emits progress via callback. Enables ffmpeg when finished.
 */
export async function installFfmpeg(
  onProgress?: (ev: FfmpegInstallProgress) => void
): Promise<FfmpegStatus> {
  if (installing) throw new Error("ffmpeg install already in progress");
  installing = true;
  const store = getStore();
  try {
    const url = downloadUrlForPlatform();
    const toolsRoot = path.join(app.getPath("userData"), "tools");
    const staging = path.join(toolsRoot, "ffmpeg-staging");
    const finalDir = bundledFfmpegDir();
    const zipPath = path.join(toolsRoot, "ffmpeg-download.zip");

    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    await fs.mkdir(toolsRoot, { recursive: true });

    onProgress?.({ phase: "download", percent: 0, message: "Downloading ffmpeg…" });
    await downloadToFile(url, zipPath, (pct) => {
      onProgress?.({ phase: "download", percent: pct, message: `Downloading ffmpeg… ${pct}%` });
    });

    onProgress?.({ phase: "extract", percent: 0, message: "Extracting…" });
    if (process.platform === "win32") {
      await extractZipWindows(zipPath, staging);
    } else {
      throw new Error("Unsupported platform for zip install");
    }

    const found = await findFfmpegInDir(staging);
    if (!found) throw new Error("ffmpeg binary not found in archive");

    await fs.rm(finalDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.mkdir(finalDir, { recursive: true });
    const destBin = bundledFfmpegBin();
    await fs.copyFile(found, destBin);
    // Copy sibling tools if present (ffprobe)
    const siblingDir = path.dirname(found);
    for (const name of ["ffprobe.exe", "ffprobe", "ffplay.exe", "ffplay"]) {
      const src = path.join(siblingDir, name);
      try {
        await fs.access(src);
        await fs.copyFile(src, path.join(finalDir, name));
      } catch {
        /* optional */
      }
    }

    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    await fs.unlink(zipPath).catch(() => undefined);

    const system = store.get("system");
    store.set("system", {
      ...system,
      ffmpegPath: destBin,
      ffmpegEnabled: true,
    });

    onProgress?.({ phase: "done", percent: 100, message: "ffmpeg installed" });
    return getFfmpegStatus();
  } catch (e) {
    onProgress?.({
      phase: "error",
      percent: 0,
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  } finally {
    installing = false;
  }
}

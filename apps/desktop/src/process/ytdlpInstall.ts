/**
 * yt-dlp binary install / probe — mirrors ffmpegInstall for the catch-all provider.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { app } from "electron";
import { getStore } from "./store";

export type YtdlpStatus = {
  available: boolean;
  enabled: boolean;
  path: string;
  version?: string;
  source: "custom" | "bundled" | "path" | "none";
  installing: boolean;
};

export type YtdlpInstallProgress = {
  phase: "download" | "done" | "error";
  percent: number;
  message: string;
};

let installing = false;

function bundledYtdlpDir(): string {
  return path.join(app.getPath("userData"), "tools", "ytdlp");
}

function bundledYtdlpBin(): string {
  return path.join(bundledYtdlpDir(), process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
}

async function probeBinary(bin: string): Promise<{ ok: boolean; version?: string }> {
  if (!bin.trim()) return { ok: false };
  try {
    if (path.isAbsolute(bin)) await fs.access(bin);
  } catch {
    if (path.isAbsolute(bin)) return { ok: false };
  }
  return await new Promise((resolve) => {
    const child = spawn(bin, ["--version"], {
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

export async function getYtdlpStatus(): Promise<YtdlpStatus> {
  const system = getStore().get("system");
  const custom = (system.ytdlpPath ?? "").trim();
  const enabled = Boolean(system.ytdlpEnabled);

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

  const bundled = bundledYtdlpBin();
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

  for (const bin of process.platform === "win32" ? ["yt-dlp.exe", "yt-dlp"] : ["yt-dlp"]) {
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

export async function resolveConfiguredYtdlp(): Promise<string | null> {
  const status = await getYtdlpStatus();
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

function downloadUrlForPlatform(): string {
  if (process.platform === "win32") {
    return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
  }
  return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
}

/** Download official yt-dlp binary into userData/tools/ytdlp. */
export async function installYtdlp(
  onProgress?: (ev: YtdlpInstallProgress) => void
): Promise<YtdlpStatus> {
  if (installing) throw new Error("yt-dlp install already in progress");
  installing = true;
  const store = getStore();
  try {
    const url = downloadUrlForPlatform();
    const finalDir = bundledYtdlpDir();
    const destBin = bundledYtdlpBin();
    await fs.mkdir(finalDir, { recursive: true });

    onProgress?.({ phase: "download", percent: 0, message: "Downloading yt-dlp…" });
    const tmp = `${destBin}.download`;
    await downloadToFile(url, tmp, (pct) => {
      onProgress?.({ phase: "download", percent: pct, message: `Downloading yt-dlp… ${pct}%` });
    });
    await fs.rm(destBin, { force: true }).catch(() => undefined);
    await fs.rename(tmp, destBin);
    if (process.platform !== "win32") {
      await fs.chmod(destBin, 0o755).catch(() => undefined);
    }

    const system = store.get("system");
    store.set("system", {
      ...system,
      ytdlpPath: destBin,
      ytdlpEnabled: true,
    });

    onProgress?.({ phase: "done", percent: 100, message: "yt-dlp installed" });
    return getYtdlpStatus();
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

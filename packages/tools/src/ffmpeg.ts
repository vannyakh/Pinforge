/**
 * ffmpeg binary resolution — shared by mux, HLS remux, and ToolRegistry.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

let ffmpegPathCache: string | null | undefined;
let configuredPath: string | undefined;
let configuredEnabled = true;

/** Call from desktop main before YouTube mux/convert so settings are honored. */
export function configureFfmpeg(opts: { path?: string; enabled?: boolean }): void {
  configuredPath = opts.path?.trim() || undefined;
  if (opts.enabled !== undefined) configuredEnabled = opts.enabled;
  ffmpegPathCache = undefined;
}

export function clearFfmpegCache(): void {
  ffmpegPathCache = undefined;
}

export async function resolveFfmpeg(): Promise<string | null> {
  if (!configuredEnabled) return null;
  if (ffmpegPathCache !== undefined) return ffmpegPathCache;

  const candidates = [
    configuredPath,
    process.platform === "win32" ? "ffmpeg.exe" : undefined,
    "ffmpeg",
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    try {
      if (path.isAbsolute(bin)) {
        await fs.access(bin);
      }
      await runFfmpeg(bin, ["-version"]);
      ffmpegPathCache = bin;
      return bin;
    } catch {
      /* try next */
    }
  }
  ffmpegPathCache = null;
  return null;
}

export function requireFfmpegMessage(): string {
  return "ffmpeg is not available. Install it in Settings → System, then enable ffmpeg tools.";
}

export async function runFfmpeg(bin: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim().split("\n").slice(-4).join(" ") || `ffmpeg exited ${code}`));
    });
  });
}

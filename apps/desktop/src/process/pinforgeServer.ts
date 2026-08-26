/**
 * Desktop ↔ pinforge-server lifecycle (required for downloads/jobs).
 */

import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import {
  ensureServer,
  getServerClient,
  type PinforgeServerClient,
} from "@pinforge/core/worker";

let started = false;

export async function startPinforgeServer(): Promise<PinforgeServerClient> {
  const dataDir = join(app.getPath("userData"), "server");
  const client = await ensureServer(dataDir);
  if (!client) {
    throw new Error(
      "pinforge-server binary not found. Run: node scripts/build-rust-server.js"
    );
  }
  if (!started) {
    started = true;
    client.on("event", (event: string, payload: unknown) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send("server:event", { event, payload });
        }
      }
    });
    client.on("stderr", (chunk: string) => {
      if (process.env.PINFORGE_SERVER_DEBUG) {
        console.error("[pinforge-server]", chunk);
      }
    });
  }

  try {
    const { resolveConfiguredYtdlp } = await import("./ytdlpInstall");
    const { resolveConfiguredFfmpeg } = await import("./ffmpegInstall");
    const ytdlp = await resolveConfiguredYtdlp();
    const ffmpeg = await resolveConfiguredFfmpeg();
    if (ytdlp || ffmpeg || process.env.PINFORGE_YTDLP || process.env.PINFORGE_FFMPEG) {
      await client.request("tools.setPaths", {
        ytdlp: ytdlp ?? process.env.PINFORGE_YTDLP,
        ffmpeg: ffmpeg ?? process.env.PINFORGE_FFMPEG,
      });
    }
    const store = (await import("./store")).getStore();
    const outDir = store.get("outDir");
    if (outDir) {
      await client.request("config.setOutDir", { outDir });
    }
  } catch {
    /* optional tool sync */
  }

  return client;
}

export async function stopPinforgeServer(): Promise<void> {
  const client = getServerClient();
  if (client.isRunning) {
    await client.stop();
  }
  started = false;
}

export function pinforgeServer(): PinforgeServerClient {
  return getServerClient();
}

export async function serverRequest<T = unknown>(
  method: string,
  params?: unknown
): Promise<T> {
  const client = getServerClient();
  if (!client.isRunning) {
    throw new Error("pinforge-server is not running");
  }
  return client.request<T>(method, params);
}

export function isPinforgeServerRunning(): boolean {
  return getServerClient().isRunning;
}

export async function requireServer(): Promise<PinforgeServerClient> {
  const client = getServerClient();
  if (client.isRunning) return client;
  return startPinforgeServer();
}

import { BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { appendToPendingQueue } from "../downloadQueue";
import type { RemoteRuntimeStatus } from "../../common/remote/types";
import { TelegramBot } from "../channels/telegram";
import { startRemoteApiServer, type RemoteApiServer } from "../webserver/remoteApi";
import { getStore } from "../store";
import { isUninstallWindow } from "../uninstallWindow";

type PendingSendBack = {
  chatId: number;
  url: string;
};

const DEFAULT_STATUS: RemoteRuntimeStatus = {
  api: { running: false, port: 8787, url: null },
  telegram: { running: false },
  tunnel: { running: false },
};

let status: RemoteRuntimeStatus = { ...DEFAULT_STATUS };
let apiServer: RemoteApiServer | null = null;
let telegramBot: TelegramBot | null = null;
let cloudflaredProc: ChildProcess | null = null;
let syncPromise: Promise<void> | null = null;
const sendBackByUrl = new Map<string, PendingSendBack>();

function broadcastRuntimeStatus(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (isUninstallWindow(win)) continue;
    win.webContents.send("remote:runtimeChanged", status);
  }
}

function setStatus(next: RemoteRuntimeStatus): void {
  status = next;
  broadcastRuntimeStatus();
}

export function getRemoteRuntimeStatus(): RemoteRuntimeStatus {
  return status;
}

async function startRemoteDownload(url: string): Promise<{ packId?: string; message: string }> {
  const store = getStore();
  const outDir = store.get("outDir")?.trim();
  if (!outDir) {
    return { message: "Set a download folder in Settings first." };
  }

  const { runProcessForRemote } = await import("../ipc");
  void runProcessForRemote({ url }).catch(() => undefined);
  return { message: `Download started for ${url}` };
}

async function handleTelegramUrls(urls: string[], chatId: number): Promise<void> {
  if (!telegramBot) return;
  const store = getStore();
  const outDir = store.get("outDir")?.trim();
  if (!outDir) {
    await telegramBot.sendMessage(chatId, "Set a download folder in Pinforge Settings → Download first.");
    return;
  }

  let started = 0;
  for (const url of urls) {
    sendBackByUrl.set(url, { chatId, url });
    const result = await startRemoteDownload(url);
    if (result.message.startsWith("Download started")) started += 1;
  }

  if (started === 0) {
    await telegramBot.sendMessage(chatId, "Could not start download. Check Settings → Download folder.");
    return;
  }

  await telegramBot.sendMessage(
    chatId,
    started === 1 ? "Downloading… I'll send the file when it's done." : `Downloading ${started} links…`
  );
}

async function stopApi(): Promise<void> {
  if (!apiServer) return;
  const closing = apiServer.close();
  apiServer = null;
  await closing;
}

function stopTelegram(): void {
  telegramBot?.stop();
  telegramBot = null;
}

async function stopTunnel(): Promise<void> {
  if (!cloudflaredProc) return;
  cloudflaredProc.kill();
  cloudflaredProc = null;
}

function resolveCloudflaredBinary(configured: string): string {
  const trimmed = configured.trim();
  if (trimmed && existsSync(trimmed)) return trimmed;
  return "cloudflared";
}

async function startTunnel(port: number, token: string, binaryPath: string): Promise<void> {
  await stopTunnel();
  const bin = resolveCloudflaredBinary(binaryPath);
  const args = token.trim()
    ? ["tunnel", "run", "--token", token.trim()]
    : ["tunnel", "--url", `http://127.0.0.1:${port}`];

  const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  cloudflaredProc = proc;

  proc.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    const match = text.match(/https:\/\/[-a-z0-9.]+\.trycloudflare\.com/i);
    if (match) {
      setStatus({
        ...status,
        tunnel: { running: true, publicUrl: match[0], error: undefined },
      });
      const store = getStore();
      store.set("remote", {
        ...store.get("remote"),
        tunnel: {
          ...store.get("remote").tunnel,
          status: "running",
          publicUrl: match[0],
          lastError: undefined,
        },
      });
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8").trim();
    if (!text) return;
    setStatus({
      ...status,
      tunnel: { ...status.tunnel, error: text.slice(0, 240) },
    });
  });

  proc.on("exit", () => {
    if (cloudflaredProc === proc) cloudflaredProc = null;
    setStatus({
      ...status,
      tunnel: { running: false, error: status.tunnel.error },
    });
  });
}

async function applyRemoteRuntime(): Promise<void> {
  const store = getStore();
  const remote = store.get("remote");
  const port = remote.tunnel.localPort || 8787;
  const host = remote.tunnel.enabled ? "0.0.0.0" : "127.0.0.1";

  const telegramChannel = remote.channels.find((c) => c.id === "telegram" && c.enabled && c.available);
  const telegramToken = telegramChannel?.botToken?.trim() ?? "";
  const shouldRunApi = Boolean(remote.tunnel.enabled || telegramChannel);

  await stopApi();
  stopTelegram();
  if (!remote.tunnel.enabled) await stopTunnel();

  const next: RemoteRuntimeStatus = {
    api: { running: false, port, url: null },
    telegram: { running: false },
    tunnel: { running: false, publicUrl: remote.tunnel.publicUrl },
  };

  if (shouldRunApi) {
    try {
      apiServer = await startRemoteApiServer(port, host, {
        onQueueUrls: (urls) => appendToPendingQueue(urls),
        onDownloadUrl: (url) => startRemoteDownload(url),
      });
      next.api = { running: true, port: apiServer.port, url: apiServer.url };
    } catch (err) {
      next.api.error = err instanceof Error ? err.message : String(err);
    }
  }

  if (telegramChannel && telegramToken) {
    try {
      telegramBot = new TelegramBot(telegramToken, {
        onDownloadRequest: async ({ urls, chatId }) => {
          await handleTelegramUrls(urls, chatId);
        },
      });
      await telegramBot.start();
      const tgStatus = telegramBot.getStatus();
      next.telegram = {
        running: tgStatus.running,
        username: tgStatus.username,
        error: tgStatus.error,
      };
    } catch (err) {
      next.telegram.error = err instanceof Error ? err.message : String(err);
    }
  }

  if (remote.tunnel.enabled && next.api.running) {
    try {
      await startTunnel(port, remote.tunnel.token, remote.tunnel.binaryPath);
      next.tunnel = {
        running: true,
        publicUrl: remote.tunnel.publicUrl,
      };
      store.set("remote", {
        ...remote,
        tunnel: { ...remote.tunnel, status: "starting", lastError: undefined },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      next.tunnel = { running: false, error: message };
      store.set("remote", {
        ...remote,
        tunnel: { ...remote.tunnel, status: "error", lastError: message },
      });
    }
  } else {
    store.set("remote", {
      ...remote,
      tunnel: {
        ...remote.tunnel,
        status: remote.tunnel.enabled ? "starting" : "stopped",
        lastError: next.tunnel.error,
        publicUrl: next.tunnel.publicUrl,
      },
    });
  }

  setStatus(next);
}

export function syncRemoteRuntime(): Promise<void> {
  if (!syncPromise) {
    syncPromise = applyRemoteRuntime().finally(() => {
      syncPromise = null;
    });
  }
  return syncPromise;
}

export async function shutdownRemoteRuntime(): Promise<void> {
  stopTelegram();
  await stopTunnel();
  await stopApi();
  setStatus({ ...DEFAULT_STATUS });
}

export async function notifyRemoteDownloadComplete(payload: {
  url: string;
  status: "done" | "partial" | "failed";
  title?: string;
  outPaths: string[];
}): Promise<void> {
  const pending = sendBackByUrl.get(payload.url);
  sendBackByUrl.delete(payload.url);
  if (!pending || !telegramBot) return;

  const remote = getStore().get("remote");
  const telegram = remote.channels.find((c) => c.id === "telegram");
  if (!telegram?.enabled || !telegram.sendFilesBack) return;

  if (payload.status !== "done" || payload.outPaths.length === 0) {
    await telegramBot.sendMessage(
      pending.chatId,
      payload.status === "failed"
        ? `Download failed for ${payload.url}`
        : `Download finished with issues for ${payload.title ?? payload.url}`
    );
    return;
  }

  const primary = payload.outPaths[0];
  if (!primary || !existsSync(primary)) {
    await telegramBot.sendMessage(pending.chatId, "Download finished but the output file was not found.");
    return;
  }

  try {
    await telegramBot.sendDocument(
      pending.chatId,
      primary,
      payload.title ? `${payload.title}` : undefined
    );
  } catch (err) {
    await telegramBot.sendMessage(
      pending.chatId,
      `Download done but file send failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

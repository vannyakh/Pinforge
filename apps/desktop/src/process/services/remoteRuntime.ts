import { BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type { RemoteRuntimeStatus } from "../../common/remote/types";
import {
  TelegramBot,
  normalizeTelegramToken,
  type TelegramDownloadRequest,
  type TelegramDownloadAction,
  type TelegramDownloadActionResult,
  downloadConfirmKeyboard,
  formatRemoteUserLabel,
} from "../channels/telegram";
import {
  createDefaultRemoteApiHandlers,
  startRemoteApiServer,
  type RemoteApiServer,
} from "../webserver/remoteApi";
import { downloadRemoteUrl, detectRemoteUrl, getRemoteToolStatus, queueRemoteUrls } from "./remoteTools";
import { clampMaxUrls, resolveBotOptions } from "./remoteBotOptions";
import {
  channelRequiresApproval,
  getRemoteUserById,
  listRemoteUsers,
  resolveRemoteAccess,
  setRemoteUserAdminMessage,
  setRemoteUserStatus,
  touchRemoteUser,
} from "./remoteAccess";
import {
  createPendingDownload,
  getPendingDownload,
  pendingSummary,
  qualityLabel,
  takePendingDownload,
  updatePendingDownload,
  formatLabel,
} from "./remoteDownloadConfirm";
import type { RemoteUser } from "../../common/remote/types";
import { getStore } from "../store";
import { isUninstallWindow } from "../uninstallWindow";
import { extractMediaPreview } from "@pinforge/core/preview";
import { youtubeQualityChoices } from "@pinforge/core/providers";
import type { YoutubeQuality } from "@pinforge/core/types";
import { DEFAULT_YOUTUBE_OPTIONS } from "@pinforge/core/types";

type SendBackTarget =
  | { kind: "telegram"; chatId: number }
  | { kind: "webhook"; url: string; channelId: string };

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
const sendBackByUrl = new Map<string, SendBackTarget>();

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

function registerSendBack(url: string, target: SendBackTarget): void {
  sendBackByUrl.set(url, target);
}

async function postAccessRequestCard(user: RemoteUser): Promise<void> {
  if (!telegramBot) return;
  const adminRaw = telegramBotOptions().adminChatId.trim();
  const adminChatId = Number(adminRaw);
  if (!Number.isFinite(adminChatId)) return;
  const msgId = await telegramBot.postAccessRequest(adminChatId, user);
  if (msgId) setRemoteUserAdminMessage(user.id, msgId);
}

function getTelegramChannel() {
  return getStore().get("remote").channels.find((c) => c.id === "telegram");
}

function telegramBotOptions() {
  return resolveBotOptions(getTelegramChannel());
}

async function ensureTelegramAccess(userId: string): Promise<"approved" | "pending" | "denied"> {
  return resolveRemoteAccess("telegram", userId);
}

async function processTelegramUrls(
  req: TelegramDownloadRequest,
  mode: "download" | "queue"
): Promise<string> {
  if (!telegramBot) return "Bot is not running.";
  const access = await ensureTelegramAccess(req.userId);
  if (access !== "approved") {
    return access === "pending" ? "Your access is pending approval." : "Access denied.";
  }

  const store = getStore();
  const outDir = store.get("outDir")?.trim();
  if (!outDir) {
    return "Set a download folder in Pinforge Settings → Download first.";
  }

  const options = telegramBotOptions();
  const urls = req.urls.slice(0, clampMaxUrls(options.maxUrlsPerMessage));
  if (urls.length === 0) return "No URLs to process.";

  let ok = 0;
  const lines: string[] = [];

  for (const url of urls) {
    if (options.detectBeforeDownload) {
      const detected = detectRemoteUrl(url);
      if (!detected.ok) {
        lines.push(`✗ ${url}\n  ${detected.error ?? "Unsupported"}`);
        continue;
      }
      lines.push(`• ${detected.provider?.label ?? "Media"} — ${url}`);
    }

    if (mode === "queue") {
      const queued = queueRemoteUrls([url]);
      if (queued > 0) ok += 1;
      else lines.push(`✗ Already queued or downloading: ${url}`);
      continue;
    }

    registerSendBack(url, { kind: "telegram", chatId: req.chatId });
    const result = await downloadRemoteUrl(url);
    if (result.ok) ok += 1;
    else lines.push(`✗ ${result.message}`);
  }

  if (ok === 0) {
    return lines.length > 0 ? lines.join("\n") : "Could not start download.";
  }

  if (mode === "queue") {
    return options.detectBeforeDownload
      ? `${lines.join("\n")}\n\nQueued ${ok} link${ok === 1 ? "" : "s"}. Press Start in Tasks.`
      : `Queued ${ok} link${ok === 1 ? "" : "s"}. Press Start in Tasks.`;
  }

  return options.detectBeforeDownload
    ? `${lines.join("\n")}\n\nDownloading ${ok} link${ok === 1 ? "" : "s"}…`
    : ok === 1
      ? replyStartedMessage(options, telegramSendBackEnabled())
      : `Downloading ${ok} links…`;
}

async function probeYoutubeQualities(url: string): Promise<{
  qualities: YoutubeQuality[];
  title?: string;
}> {
  try {
    const preview = await Promise.race([
      extractMediaPreview(url, { channelMaxVideos: 1 }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
    ]);
    if (!preview) return { qualities: youtubeQualityChoices() };
    return {
      qualities: youtubeQualityChoices(preview.qualities),
      title: preview.title,
    };
  } catch {
    return { qualities: youtubeQualityChoices() };
  }
}

async function offerTelegramDownload(req: TelegramDownloadRequest): Promise<string> {
  if (!telegramBot) return "Bot is not running.";
  const access = await ensureTelegramAccess(req.userId);
  if (access !== "approved") {
    return access === "pending" ? "Your access is pending approval." : "Access denied.";
  }

  const store = getStore();
  const outDir = store.get("outDir")?.trim();
  if (!outDir) {
    return "Set a download folder in Pinforge Settings → Download first.";
  }

  const options = telegramBotOptions();
  const url = req.urls[0]?.trim();
  if (!url) return "No URL to download.";

  const detected = detectRemoteUrl(url);
  if (!detected.ok) return detected.error ?? "URL not supported.";

  let qualities: YoutubeQuality[] = [];
  let title: string | undefined;
  const isYoutube = detected.provider?.id === "youtube";
  if (options.allowQualitySelect && isYoutube) {
    const probed = await probeYoutubeQualities(url);
    qualities = probed.qualities;
    title = probed.title;
  } else if (options.allowQualitySelect) {
    qualities = [];
  }

  const youtube = { ...DEFAULT_YOUTUBE_OPTIONS, ...store.get("youtube") };
  const pending = createPendingDownload({
    url,
    chatId: req.chatId,
    userId: req.userId,
    qualities: qualities.length ? qualities : youtubeQualityChoices(),
    providerId: detected.provider?.id,
    providerLabel: detected.provider?.label,
    title,
    // Height caps are YouTube-oriented; keep "best" for yt-dlp sites (Bilibili, etc.).
    quality: isYoutube ? (youtube.quality ?? "best") : "best",
  });

  const showQuality = options.allowQualitySelect && isYoutube;
  const showFormat = options.allowQualitySelect;
  const keyboard = downloadConfirmKeyboard(pending, { showQuality, showFormat });
  await telegramBot.sendMessage(req.chatId, pendingSummary(pending), keyboard);
  return "";
}

async function handleTelegramDownloadAction(
  action: TelegramDownloadAction,
  ctx: { chatId: number; userId: string; messageId: number }
): Promise<TelegramDownloadActionResult> {
  const access = await ensureTelegramAccess(ctx.userId);
  if (access !== "approved") {
    return { answer: "Access denied" };
  }

  if (action.kind === "quality" || action.kind === "format") {
    const item = getPendingDownload(action.id);
    if (!item || item.chatId !== ctx.chatId || item.userId !== ctx.userId) {
      return { answer: "Expired", editText: "This download offer expired. Send the link again." };
    }
    const updated =
      action.kind === "quality"
        ? updatePendingDownload(action.id, { quality: action.quality })
        : updatePendingDownload(action.id, { format: action.format });
    if (!updated) {
      return { answer: "Expired", editText: "This download offer expired. Send the link again." };
    }
    const options = telegramBotOptions();
    const showQuality = options.allowQualitySelect && updated.providerId === "youtube";
    const showFormat = options.allowQualitySelect;
    return {
      answer:
        action.kind === "quality"
          ? `Quality: ${qualityLabel(action.quality)}`
          : `Format: ${formatLabel(action.format)}`,
      editText: pendingSummary(updated),
      keyboard: downloadConfirmKeyboard(updated, { showQuality, showFormat }),
    };
  }

  if (action.kind === "cancel") {
    const item = takePendingDownload(action.id);
    if (!item || item.chatId !== ctx.chatId) {
      return { answer: "Cancelled", editText: "Cancelled.", keyboard: null };
    }
    return { answer: "Cancelled", editText: `Cancelled: ${item.url}`, keyboard: null };
  }

  const item = takePendingDownload(action.id);
  if (!item || item.chatId !== ctx.chatId || item.userId !== ctx.userId) {
    return {
      answer: "Expired",
      editText: "This download offer expired. Send the link again.",
      keyboard: null,
    };
  }

  const override = {
    format: item.format,
    youtube: item.providerId === "youtube" ? { quality: item.quality } : { quality: "best" as const },
  };

  if (action.kind === "queue") {
    const queued = queueRemoteUrls([item.url], override);
    const label =
      item.providerId === "youtube"
        ? `${qualityLabel(item.quality)} · ${formatLabel(item.format)}`
        : formatLabel(item.format);
    return {
      answer: queued > 0 ? "Queued" : "Already queued",
      editText:
        queued > 0
          ? `Queued (${label}):\n${item.url}\n\nPress Start in Tasks.`
          : `Already queued or downloading:\n${item.url}`,
      keyboard: null,
    };
  }

  registerSendBack(item.url, { kind: "telegram", chatId: item.chatId });
  const result = await downloadRemoteUrl(item.url, override);
  if (!result.ok) {
    return {
      answer: "Failed",
      editText: `Could not start download:\n${result.message}`,
      keyboard: null,
    };
  }

  const startedLabel =
    item.providerId === "youtube"
      ? `${qualityLabel(item.quality)} · ${formatLabel(item.format)}`
      : formatLabel(item.format);
  return {
    answer: "Started",
    editText: [
      `Downloading (${startedLabel})…`,
      item.title ? item.title : undefined,
      item.url,
    ]
      .filter(Boolean)
      .join("\n"),
    keyboard: null,
  };
}

function telegramSendBackEnabled(): boolean {
  const remote = getStore().get("remote");
  return Boolean(remote.channels.find((c) => c.id === "telegram")?.sendFilesBack);
}

function replyStartedMessage(
  options: ReturnType<typeof telegramBotOptions>,
  sendFiles: boolean
): string {
  if (sendFiles && options.notifyOnComplete) {
    return "Downloading… I'll reply and send the file when it's done.";
  }
  if (sendFiles) return "Downloading… I'll send the file when it's done.";
  if (options.notifyOnComplete) return "Downloading… I'll reply when it's done.";
  return "Downloading…";
}

async function postJsonWebhook(webhookUrl: string, payload: unknown): Promise<void> {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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
  const telegramToken = normalizeTelegramToken(telegramChannel?.botToken ?? "");
  const enabledChannels = remote.channels.filter((c) => c.enabled && c.available);
  const shouldRunApi = Boolean(remote.tunnel.enabled || enabledChannels.length > 0);

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
      apiServer = await startRemoteApiServer(
        port,
        host,
        createDefaultRemoteApiHandlers((url, target) => {
          if (target.channel === "telegram" && typeof target.chatId === "number") {
            registerSendBack(url, { kind: "telegram", chatId: target.chatId });
          }
        })
      );
      next.api = { running: true, port: apiServer.port, url: apiServer.url };
    } catch (err) {
      next.api.error = err instanceof Error ? err.message : String(err);
    }
  }

  if (telegramChannel && telegramToken) {
    try {
      telegramBot = new TelegramBot(telegramToken, {
        getOptions: () => telegramBotOptions(),
        onUserInteract: async (ctx) => {
          if (!channelRequiresApproval("telegram")) return "approved";
          const { user, created } = touchRemoteUser({
            channel: "telegram",
            externalId: ctx.userId,
            username: ctx.username,
            displayName: ctx.displayName,
          });
          if (created && user.status === "pending") {
            await postAccessRequestCard(user);
          }
          return user.status;
        },
        onStatus: async () => {
          const tool = getRemoteToolStatus();
          const access = tool.enabledChannels.includes("telegram") ? "enabled" : "disabled";
          return [
            "Pinforge status",
            `Bot: ${access}`,
            `Download folder: ${tool.outDirReady ? "ready" : "not set"}`,
            `Queue: ${tool.queueCount} pending`,
            `Running: ${tool.runningPacks} active`,
            `Mode: ${telegramBotOptions().downloadMode}`,
          ].join("\n");
        },
        onDetect: async (url) => {
          const hit = detectRemoteUrl(url);
          if (!hit.ok) return hit.error ?? "Could not detect provider.";
          return `Provider: ${hit.provider?.label ?? "Unknown"} (${hit.provider?.live ? "live" : "offline"})`;
        },
        onQueue: (req) => processTelegramUrls(req, "queue"),
        onDownload: (req) => processTelegramUrls(req, "download"),
        onOfferDownload: (req) => offerTelegramDownload(req),
        onDownloadAction: (action, ctx) => handleTelegramDownloadAction(action, ctx),
        onAccessDecision: async (userId, status, _adminUserId) => {
          const user = getRemoteUserById(userId);
          if (!user) return "User not found.";
          if (user.status !== "pending") return `Already ${user.status}.`;
          const updated = setRemoteUserStatus(userId, status);
          if (!updated) return "Could not update user.";
          await notifyTelegramAccessDecision(updated.externalId, status);
          return `${formatRemoteUserLabel(updated)} — ${status}`;
        },
        onAdminListUsers: async (adminChatId) => {
          if (!telegramBot) return;
          const pending = listRemoteUsers({ channel: "telegram", status: "pending" });
          if (pending.length === 0) {
            await telegramBot.sendMessage(adminChatId, "No pending access requests.");
            return;
          }
          let posted = 0;
          for (const user of pending) {
            if (user.adminMessageId) continue;
            const msgId = await telegramBot.postAccessRequest(adminChatId, user);
            if (msgId) {
              setRemoteUserAdminMessage(user.id, msgId);
              posted += 1;
            }
          }
          if (posted === 0) {
            await telegramBot.sendMessage(adminChatId, `${pending.length} pending — cards already in channel.`);
          }
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

async function notifyTelegramSendBack(
  target: Extract<SendBackTarget, { kind: "telegram" }>,
  payload: {
    url: string;
    status: "done" | "partial" | "failed";
    title?: string;
    outPaths: string[];
  }
): Promise<void> {
  if (!telegramBot) return;
  const remote = getStore().get("remote");
  const telegram = remote.channels.find((c) => c.id === "telegram");
  const options = resolveBotOptions(telegram);
  const shouldNotify =
    telegram?.enabled && (telegram.sendFilesBack || options.notifyOnComplete);

  if (!shouldNotify) return;

  if (payload.status !== "done" || payload.outPaths.length === 0) {
    if (options.notifyOnComplete) {
      await telegramBot.sendMessage(
        target.chatId,
        payload.status === "failed"
          ? `Download failed for ${payload.url}`
          : `Download finished with issues for ${payload.title ?? payload.url}`
      );
    }
    return;
  }

  const primary = payload.outPaths[0];
  if (!primary || !existsSync(primary)) {
    if (options.notifyOnComplete) {
      await telegramBot.sendMessage(target.chatId, "Download finished but the output file was not found.");
    }
    return;
  }

  const label = payload.title ?? payload.url;
  if (options.notifyOnComplete) {
    const extra =
      payload.outPaths.length > 1 ? ` (${payload.outPaths.length} files)` : "";
    await telegramBot.sendMessage(target.chatId, `Done: ${label}${extra}`);
  }

  if (!telegram?.sendFilesBack) return;

  try {
    await telegramBot.sendDocument(
      target.chatId,
      primary,
      payload.title ? `${payload.title}` : undefined
    );
  } catch (err) {
    await telegramBot.sendMessage(
      target.chatId,
      `Download done but file send failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function notifyWebhookChannels(payload: {
  url: string;
  status: "done" | "partial" | "failed";
  title?: string;
  outPaths: string[];
}): Promise<void> {
  const remote = getStore().get("remote");
  const allowFiles = remote.tunnel.allowFileSendBack;
  const channels = remote.channels.filter(
    (c) => c.enabled && c.available && c.sendFilesBack && c.webhookUrl?.trim()
  );

  for (const channel of channels) {
    const webhookUrl = channel.webhookUrl!.trim();
    const isDiscord =
      channel.id === "discord" ||
      /^https:\/\/(discord(?:app)?\.com|discord\.com)\/api\/webhooks\//i.test(webhookUrl);

    const body = {
      event: "download.complete",
      channel: channel.id,
      url: payload.url,
      status: payload.status,
      title: payload.title,
      outPaths: allowFiles ? payload.outPaths : payload.outPaths.map(() => "[hidden]"),
      timestamp: Date.now(),
    };

    try {
      if (isDiscord) {
        await postJsonWebhook(webhookUrl, {
          content: null,
          embeds: [
            {
              title: payload.title ?? "Download complete",
              description:
                payload.status === "done" ? payload.url : `${payload.status}: ${payload.url}`,
              color:
                payload.status === "done" ? 0x00b42a : payload.status === "failed" ? 0xf53f3f : 0xff7d00,
            },
          ],
        });
      } else {
        await postJsonWebhook(webhookUrl, body);
      }
    } catch {
      /* best-effort */
    }
  }
}

export async function notifyRemoteDownloadComplete(payload: {
  url: string;
  status: "done" | "partial" | "failed";
  title?: string;
  outPaths: string[];
}): Promise<void> {
  const pending = sendBackByUrl.get(payload.url);
  sendBackByUrl.delete(payload.url);

  if (pending?.kind === "telegram") {
    await notifyTelegramSendBack(pending, payload);
  }

  await notifyWebhookChannels(payload);
}

/** Notify a Telegram user about an access decision (approve/deny). */
export async function notifyTelegramAccessDecision(
  externalId: string,
  status: "approved" | "denied"
): Promise<void> {
  if (!telegramBot) return;
  const chatId = Number(externalId);
  if (!Number.isFinite(chatId)) return;

  if (status === "approved") {
    const welcome = resolveBotOptions(getTelegramChannel()).welcomeMessage.trim();
    await telegramBot.sendMessage(
      chatId,
      welcome ||
        "You have been approved! Send a media URL or use /download <url>."
    );
    return;
  }

  await telegramBot.sendMessage(chatId, "Your access to this bot was denied.");
}

export function getActiveTelegramBot(): TelegramBot | null {
  return telegramBot;
}

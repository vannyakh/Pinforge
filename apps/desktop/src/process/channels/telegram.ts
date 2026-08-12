import { extractMediaUrls, normalizeMediaUrl } from "../downloadQueue";
import type { RemoteBotOptions, RemoteUser } from "../../common/remote/types";
import { DEFAULT_BOT_OPTIONS } from "../services/remoteBotOptions";
import type { FormatPreset, YoutubeQuality } from "@pinforge/core/types";
import {
  formatLabel,
  isFormatPreset,
  isYoutubeQuality,
  qualityLabel,
  type RemotePendingDownload,
} from "../services/remoteDownloadConfirm";

type TelegramApiResponse<T = unknown> = {
  ok?: boolean;
  result?: T;
  description?: string;
};

type InlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

type ReplyKeyboard = {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard?: boolean;
  is_persistent?: boolean;
  one_time_keyboard?: boolean;
  input_field_placeholder?: string;
};

type ReplyMarkup = InlineKeyboard | ReplyKeyboard | { remove_keyboard: true };

export const ACCESS_APPROVE_PREFIX = "pf:approve:";
export const ACCESS_DENY_PREFIX = "pf:deny:";
export const DL_QUALITY_PREFIX = "pf:y:";
export const DL_FORMAT_PREFIX = "pf:f:";
export const DL_GO_PREFIX = "pf:go:";
export const DL_QUEUE_PREFIX = "pf:qu:";
export const DL_CANCEL_PREFIX = "pf:x:";

/** Persistent reply-keyboard labels (must match normalizeMenuText). */
export const MENU_BTN = {
  download: "⬇️ Download",
  queue: "📥 Queue",
  detect: "🔎 Detect",
  status: "📊 Status",
  help: "❓ Help",
  menu: "☰ Menu",
  users: "👥 Users",
} as const;

export type TelegramUserContext = {
  chatId: number;
  messageId: number;
  userId: string;
  username?: string;
  displayName?: string;
  text: string;
  isStart: boolean;
};

export type TelegramAccessResult = "approved" | "pending" | "denied";

/** Strip common paste mistakes (@BotFather token, URL, "bot" prefix). */
export function normalizeTelegramToken(raw: string): string {
  let token = raw.trim();
  if (!token) return "";

  const urlMatch = token.match(/api\.telegram\.org\/bot([^/?#\s]+)/i);
  if (urlMatch?.[1]) token = urlMatch[1];

  if (/^bot\d/i.test(token)) token = token.slice(3);

  return token.trim();
}

function formatTelegramError(description: string | undefined, fallback: string): string {
  if (description === "Not Found") {
    return 'Invalid bot token. Copy the token from @BotFather (format: 123456789:ABC…). Do not include "bot" or a Telegram URL.';
  }
  return description || fallback;
}

export type TelegramDownloadRequest = {
  urls: string[];
  chatId: number;
  messageId: number;
  userId: string;
};

export type TelegramDownloadAction =
  | { kind: "quality"; id: string; quality: YoutubeQuality }
  | { kind: "format"; id: string; format: FormatPreset }
  | { kind: "go"; id: string }
  | { kind: "queue"; id: string }
  | { kind: "cancel"; id: string };

export type TelegramDownloadActionResult = {
  answer: string;
  editText?: string;
  keyboard?: InlineKeyboard | null;
};

export type TelegramBotCallbacks = {
  getOptions: () => Required<RemoteBotOptions>;
  onUserInteract: (ctx: TelegramUserContext) => Promise<TelegramAccessResult>;
  onStatus: () => Promise<string>;
  onDetect: (url: string) => Promise<string>;
  onQueue: (req: TelegramDownloadRequest) => Promise<string>;
  onDownload: (req: TelegramDownloadRequest) => Promise<string>;
  /** When confirm/quality menus are enabled, offer an interactive download card. */
  onOfferDownload: (req: TelegramDownloadRequest) => Promise<string>;
  onDownloadAction: (
    action: TelegramDownloadAction,
    ctx: { chatId: number; userId: string; messageId: number }
  ) => Promise<TelegramDownloadActionResult>;
  onAccessDecision: (
    userId: string,
    status: "approved" | "denied",
    adminUserId: string
  ) => Promise<string>;
  onAdminListUsers: (adminChatId: number) => Promise<void>;
};

export function formatRemoteUserLabel(user: RemoteUser): string {
  if (user.displayName && user.username) return `${user.displayName} (@${user.username})`;
  return user.displayName || (user.username ? `@${user.username}` : user.externalId);
}

export function accessRequestKeyboard(userId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "Approve", callback_data: `${ACCESS_APPROVE_PREFIX}${userId}` },
        { text: "Deny", callback_data: `${ACCESS_DENY_PREFIX}${userId}` },
      ],
    ],
  };
}

export function downloadConfirmKeyboard(
  item: RemotePendingDownload,
  opts: { showQuality: boolean; showFormat: boolean }
): InlineKeyboard {
  const rows: InlineKeyboard["inline_keyboard"] = [];

  if (opts.showQuality && item.qualities.length > 0) {
    const qualityButtons = item.qualities.slice(0, 6).map((q) => ({
      text: item.quality === q ? `✓ ${qualityLabel(q)}` : qualityLabel(q),
      callback_data: `${DL_QUALITY_PREFIX}${item.id}:${q}`,
    }));
    for (let i = 0; i < qualityButtons.length; i += 3) {
      rows.push(qualityButtons.slice(i, i + 3));
    }
  }

  if (opts.showFormat) {
    const formats: FormatPreset[] = ["best", "mp4", "audio-only"];
    rows.push(
      formats.map((f) => ({
        text: item.format === f ? `✓ ${formatLabel(f)}` : formatLabel(f),
        callback_data: `${DL_FORMAT_PREFIX}${item.id}:${f}`,
      }))
    );
  }

  rows.push([
    { text: "⬇️ Download", callback_data: `${DL_GO_PREFIX}${item.id}` },
    { text: "📥 Queue", callback_data: `${DL_QUEUE_PREFIX}${item.id}` },
    { text: "Cancel", callback_data: `${DL_CANCEL_PREFIX}${item.id}` },
  ]);

  return { inline_keyboard: rows };
}

/** Bottom reply keyboard for approved users. */
export function mainReplyKeyboard(): ReplyKeyboard {
  return {
    keyboard: [
      [{ text: MENU_BTN.download }, { text: MENU_BTN.queue }],
      [{ text: MENU_BTN.detect }, { text: MENU_BTN.status }],
      [{ text: MENU_BTN.help }, { text: MENU_BTN.menu }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Paste a media URL…",
  };
}

/** Bottom reply keyboard for the admin chat. */
export function adminReplyKeyboard(): ReplyKeyboard {
  return {
    keyboard: [[{ text: MENU_BTN.users }, { text: MENU_BTN.help }]],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Admin commands…",
  };
}

/** Map reply-keyboard taps (and plain labels) onto slash commands. */
function normalizeMenuText(text: string): string {
  const t = text.trim();
  const map: Record<string, string> = {
    [MENU_BTN.download]: "/download",
    [MENU_BTN.queue]: "/queue",
    [MENU_BTN.detect]: "/detect",
    [MENU_BTN.status]: "/status",
    [MENU_BTN.help]: "/help",
    [MENU_BTN.menu]: "/menu",
    [MENU_BTN.users]: "/users",
    Download: "/download",
    Queue: "/queue",
    Detect: "/detect",
    Status: "/status",
    Help: "/help",
    Menu: "/menu",
    Users: "/users",
  };
  return map[t] ?? t;
}

type TelegramMessageEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
};

/** Telegram entity offsets are UTF-16 code units. */
function utf16Slice(text: string, start: number, end: number): string {
  return Buffer.from(text, "utf16le")
    .subarray(start * 2, end * 2)
    .toString("utf16le");
}

/** Collect URLs from Telegram text + message entities (text_link / url). */
function extractUrlsFromTelegramMessage(
  text: string,
  entities?: TelegramMessageEntity[]
): string[] {
  const fromText = extractMediaUrls(text);
  if (!entities?.length) return fromText;

  const seen = new Set(fromText);
  const out = [...fromText];
  const push = (raw?: string) => {
    if (!raw) return;
    const n = normalizeMediaUrl(raw) ?? extractMediaUrls(raw)[0];
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };

  for (const ent of entities) {
    if (ent.type === "text_link" && ent.url) {
      push(ent.url);
      continue;
    }
    if (ent.type === "url") {
      push(utf16Slice(text, ent.offset, ent.offset + ent.length));
    }
  }
  return out;
}

function parseCommand(
  text: string,
  entities?: TelegramMessageEntity[]
): { command?: string; args: string; urls: string[] } {
  const trimmed = normalizeMenuText(text);
  if (!trimmed.startsWith("/")) {
    return { args: trimmed, urls: extractUrlsFromTelegramMessage(trimmed, entities) };
  }
  const space = trimmed.indexOf(" ");
  const rawCmd = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase();
  const command = rawCmd.split("@")[0];
  const args = space === -1 ? "" : trimmed.slice(space + 1).trim();
  // Entity offsets apply to the full original message text.
  const urls = extractUrlsFromTelegramMessage(text, entities);
  if (urls.length === 0 && args) {
    return { command, args, urls: extractMediaUrls(args) };
  }
  return { command, args, urls };
}

function helpText(options: Required<RemoteBotOptions>): string {
  const mode = options.downloadMode === "queue" ? "queue" : "download immediately";
  const confirm = options.confirmBeforeDownload || options.allowQualitySelect;
  return [
    "Pinforge download bot",
    "",
    "Uses the same download tools as the desktop app (YouTube, Pinterest, TikTok, Instagram, Facebook, yt-dlp catch-all).",
    "",
    confirm
      ? "Send any media URL to open a download menu (quality + confirm)."
      : "Send any media URL to " + mode + ".",
    "",
    "Buttons:",
    `${MENU_BTN.download} / ${MENU_BTN.queue} — then paste a URL`,
    `${MENU_BTN.detect} — check which desktop provider matches`,
    `${MENU_BTN.status} — app, tools & providers`,
    `${MENU_BTN.help} — this message`,
    "",
    "Commands:",
    "/start — register or check access",
    "/menu — show the button keyboard again",
    "/help — this message",
    "/status — app & queue status",
    "/detect <url> — check provider",
    "/queue <url> — add to Tasks queue",
    "/download <url> — start download now",
    "",
    "Also use the Menu (☰) next to the message field for slash commands.",
  ].join("\n");
}

const BOT_COMMANDS = [
  { command: "start", description: "Register or check access" },
  { command: "menu", description: "Show button keyboard" },
  { command: "help", description: "Show commands" },
  { command: "status", description: "App & queue status" },
  { command: "detect", description: "Detect provider for a URL" },
  { command: "download", description: "Download a URL now" },
  { command: "queue", description: "Add a URL to the Tasks queue" },
] as const;

function parseDownloadAction(data: string): TelegramDownloadAction | null {
  if (data.startsWith(DL_QUALITY_PREFIX)) {
    const rest = data.slice(DL_QUALITY_PREFIX.length);
    const sep = rest.lastIndexOf(":");
    if (sep <= 0) return null;
    const id = rest.slice(0, sep);
    const quality = rest.slice(sep + 1);
    if (!id || !isYoutubeQuality(quality)) return null;
    return { kind: "quality", id, quality };
  }
  if (data.startsWith(DL_FORMAT_PREFIX)) {
    const rest = data.slice(DL_FORMAT_PREFIX.length);
    const sep = rest.lastIndexOf(":");
    if (sep <= 0) return null;
    const id = rest.slice(0, sep);
    const format = rest.slice(sep + 1);
    if (!id || !isFormatPreset(format)) return null;
    return { kind: "format", id, format };
  }
  if (data.startsWith(DL_GO_PREFIX)) {
    return { kind: "go", id: data.slice(DL_GO_PREFIX.length) };
  }
  if (data.startsWith(DL_QUEUE_PREFIX)) {
    return { kind: "queue", id: data.slice(DL_QUEUE_PREFIX.length) };
  }
  if (data.startsWith(DL_CANCEL_PREFIX)) {
    return { kind: "cancel", id: data.slice(DL_CANCEL_PREFIX.length) };
  }
  return null;
}

export class TelegramBot {
  private readonly token: string;
  private readonly callbacks: TelegramBotCallbacks;
  private offset = 0;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private username: string | undefined;
  private lastError: string | undefined;

  constructor(token: string, callbacks: TelegramBotCallbacks) {
    this.token = normalizeTelegramToken(token);
    this.callbacks = callbacks;
  }

  getStatus(): { running: boolean; username?: string; error?: string } {
    return { running: this.running, username: this.username, error: this.lastError };
  }

  private apiUrl(method: string): string {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  private async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.apiUrl(method), {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as TelegramApiResponse<T>;
    if (!data.ok) {
      throw new Error(formatTelegramError(data.description, `Telegram ${method} failed (${res.status})`));
    }
    return data.result as T;
  }

  async sendMessage(
    chatId: number,
    text: string,
    keyboard?: ReplyMarkup
  ): Promise<{ message_id: number }> {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboard | null
  ): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: true,
    };
    if (keyboard === null) {
      body.reply_markup = { inline_keyboard: [] };
    } else if (keyboard) {
      body.reply_markup = keyboard;
    }
    await this.call("editMessageText", body);
  }

  private async answerCallback(callbackQueryId: string, text: string): Promise<void> {
    await this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    });
  }

  async sendDocument(chatId: number, filePath: string, caption?: string): Promise<void> {
    const { readFile } = await import("node:fs/promises");
    const { basename } = await import("node:path");
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption);
    const bytes = await readFile(filePath);
    form.append("document", new Blob([bytes]), basename(filePath));
    const res = await fetch(this.apiUrl("sendDocument"), { method: "POST", body: form });
    const data = (await res.json()) as TelegramApiResponse;
    if (!data.ok) {
      throw new Error(data.description || `sendDocument failed (${res.status})`);
    }
  }

  private async ensurePollingReady(): Promise<void> {
    await this.call("deleteWebhook", { drop_pending_updates: false });
    const me = await this.call<{ username?: string; first_name?: string }>("getMe");
    this.username = me.username ?? me.first_name;
    try {
      await this.call("setMyCommands", { commands: [...BOT_COMMANDS] });
    } catch {
      /* menu is optional */
    }
    try {
      // Shows the ☰ Menu button beside the message composer with slash commands.
      await this.call("setChatMenuButton", { menu_button: { type: "commands" } });
    } catch {
      /* optional on older API */
    }
  }

  private schedulePoll(delayMs = 0): void {
    if (!this.running) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.pollOnce(), delayMs);
  }

  private async pollOnce(): Promise<void> {
    if (!this.running) return;
    try {
      const updates = await this.call<
        Array<{
          update_id: number;
          callback_query?: {
            id: string;
            data?: string;
            message?: { message_id: number; chat: { id: number } };
            from?: { id: number; username?: string; first_name?: string };
          };
          message?: {
            message_id: number;
            chat: { id: number };
            from?: {
              id: number;
              username?: string;
              first_name?: string;
              last_name?: string;
            };
            text?: string;
            entities?: TelegramMessageEntity[];
          };
        }>
      >("getUpdates", {
        offset: this.offset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"],
      });

      for (const update of updates) {
        this.offset = update.update_id + 1;
        if (update.callback_query) {
          await this.handleCallbackQuery(update.callback_query);
          continue;
        }
        const msg = update.message;
        if (!msg?.text?.trim()) continue;
        await this.handleMessage(msg);
      }
      this.lastError = undefined;
      this.schedulePoll(100);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.schedulePoll(5000);
    }
  }

  private displayName(from?: {
    username?: string;
    first_name?: string;
    last_name?: string;
  }): string | undefined {
    if (!from) return undefined;
    const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
    return name || from.username;
  }

  private welcomeMessage(access: TelegramAccessResult): string {
    const options = this.callbacks.getOptions();
    if (access === "approved" && options.welcomeMessage.trim()) {
      return options.welcomeMessage.trim();
    }
    if (access === "approved") {
      return "Welcome! You are approved.\n\nPaste a media URL, or use the buttons below.";
    }
    if (access === "pending") {
      return "Access requested. An admin will approve you in the bot admin channel.";
    }
    return "Your access to this bot was denied.";
  }

  private async requireApproved(
    chatId: number,
    access: TelegramAccessResult
  ): Promise<boolean> {
    if (access === "approved") return true;
    await this.sendMessage(
      chatId,
      access === "pending"
        ? "Your access is pending approval. Send /start after an admin approves you."
        : "Access denied. Contact the Pinforge admin if you think this is a mistake."
    );
    return false;
  }

  private buildRequest(
    msg: { message_id: number; chat: { id: number }; from?: { id: number } },
    userId: string,
    urls: string[]
  ): TelegramDownloadRequest {
    return {
      urls,
      chatId: msg.chat.id,
      messageId: msg.message_id,
      userId,
    };
  }

  private adminChatId(): number | null {
    const raw = this.callbacks.getOptions().adminChatId.trim();
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  }

  private isAdminChat(chatId: number): boolean {
    const adminId = this.adminChatId();
    return adminId != null && adminId === chatId;
  }

  private usesConfirmMenu(): boolean {
    const options = this.callbacks.getOptions();
    return options.confirmBeforeDownload || options.allowQualitySelect;
  }

  private async handleCallbackQuery(query: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
    from?: { id: number };
  }): Promise<void> {
    const data = query.data ?? "";
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    if (chatId == null || messageId == null) {
      await this.answerCallback(query.id, "Expired");
      return;
    }

    const downloadAction = parseDownloadAction(data);
    if (downloadAction) {
      const userId = String(query.from?.id ?? chatId);
      const result = await this.callbacks.onDownloadAction(downloadAction, {
        chatId,
        userId,
        messageId,
      });
      await this.answerCallback(query.id, result.answer);
      if (result.editText != null) {
        try {
          await this.editMessage(
            chatId,
            messageId,
            result.editText,
            result.keyboard === undefined ? undefined : result.keyboard
          );
        } catch {
          /* message may already be edited */
        }
      }
      return;
    }

    if (!this.isAdminChat(chatId)) {
      await this.answerCallback(query.id, "Unknown action.");
      return;
    }

    const adminUserId = String(query.from?.id ?? "");
    let reply = "Unknown action.";
    if (data.startsWith(ACCESS_APPROVE_PREFIX)) {
      reply = await this.callbacks.onAccessDecision(
        data.slice(ACCESS_APPROVE_PREFIX.length),
        "approved",
        adminUserId
      );
    } else if (data.startsWith(ACCESS_DENY_PREFIX)) {
      reply = await this.callbacks.onAccessDecision(
        data.slice(ACCESS_DENY_PREFIX.length),
        "denied",
        adminUserId
      );
    }

    await this.answerCallback(query.id, reply);

    try {
      await this.editMessage(chatId, messageId, reply, null);
    } catch {
      /* message may already be edited */
    }
  }

  accessRequestText(user: RemoteUser): string {
    return [
      "Access request",
      formatRemoteUserLabel(user),
      `Telegram ID: ${user.externalId}`,
      `Status: ${user.status}`,
    ].join("\n");
  }

  async postAccessRequest(adminChatId: number, user: RemoteUser): Promise<number | null> {
    try {
      const result = await this.sendMessage(
        adminChatId,
        this.accessRequestText(user),
        accessRequestKeyboard(user.id)
      );
      return result.message_id;
    } catch {
      return null;
    }
  }

  private async handleUrls(
    msg: { message_id: number; chat: { id: number } },
    userId: string,
    urls: string[],
    forceMode?: "download" | "queue"
  ): Promise<void> {
    const chatId = msg.chat.id;
    const req = this.buildRequest(msg, userId, urls);
    if (!forceMode && this.usesConfirmMenu()) {
      const reply = await this.callbacks.onOfferDownload(req);
      if (reply) await this.sendMessage(chatId, reply);
      return;
    }
    if (forceMode === "queue") {
      await this.sendMessage(chatId, await this.callbacks.onQueue(req));
      return;
    }
    if (forceMode === "download") {
      await this.sendMessage(chatId, await this.callbacks.onDownload(req));
      return;
    }
    const options = this.callbacks.getOptions();
    const reply =
      options.downloadMode === "queue"
        ? await this.callbacks.onQueue(req)
        : await this.callbacks.onDownload(req);
    await this.sendMessage(chatId, reply);
  }

  private async handleMessage(msg: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string; last_name?: string };
    text?: string;
    entities?: TelegramMessageEntity[];
  }): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text!.trim();
    const userId = String(msg.from?.id ?? chatId);
    const parsed = parseCommand(text, msg.entities);
    const options = this.callbacks.getOptions();
    const ctx: TelegramUserContext = {
      chatId,
      messageId: msg.message_id,
      userId,
      username: msg.from?.username,
      displayName: this.displayName(msg.from),
      text,
      isStart: parsed.command === "/start",
    };

    if (parsed.command === "/help" || parsed.command === "/menu") {
      if (this.isAdminChat(chatId)) {
        await this.sendMessage(
          chatId,
          "Admin commands:\n/users — list pending access requests\nUse the buttons below.",
          adminReplyKeyboard()
        );
        return;
      }
      const access = await this.callbacks.onUserInteract({ ...ctx, isStart: false });
      const markup = access === "approved" ? mainReplyKeyboard() : undefined;
      await this.sendMessage(
        chatId,
        parsed.command === "/menu"
          ? "Menu ready. Paste a media URL, or tap a button below."
          : helpText(options),
        markup
      );
      return;
    }

    if (this.isAdminChat(chatId) && parsed.command === "/users") {
      await this.callbacks.onAdminListUsers(chatId);
      return;
    }

    if (this.isAdminChat(chatId)) {
      await this.sendMessage(
        chatId,
        "Admin channel. Use /users or the Users button to manage access requests.",
        adminReplyKeyboard()
      );
      return;
    }

    if (parsed.command === "/status") {
      const access = await this.callbacks.onUserInteract({ ...ctx, isStart: false });
      if (!(await this.requireApproved(chatId, access))) return;
      await this.sendMessage(chatId, await this.callbacks.onStatus(), mainReplyKeyboard());
      return;
    }

    const access = await this.callbacks.onUserInteract(ctx);

    if (ctx.isStart) {
      await this.sendMessage(
        chatId,
        this.welcomeMessage(access),
        access === "approved" ? mainReplyKeyboard() : undefined
      );
      return;
    }

    if (!(await this.requireApproved(chatId, access))) return;

    if (parsed.command === "/detect") {
      const url = parsed.urls[0];
      if (!url) {
        await this.sendMessage(
          chatId,
          "Send a media URL to detect, or:\n/detect <url>",
          mainReplyKeyboard()
        );
        return;
      }
      await this.sendMessage(chatId, await this.callbacks.onDetect(url), mainReplyKeyboard());
      return;
    }

    if (parsed.command === "/queue") {
      const urls = parsed.urls.slice(0, options.maxUrlsPerMessage);
      if (urls.length === 0) {
        await this.sendMessage(
          chatId,
          "Paste a media URL to queue it, or:\n/queue <url>",
          mainReplyKeyboard()
        );
        return;
      }
      // Explicit /queue skips confirm and queues immediately.
      await this.handleUrls(msg, userId, urls, "queue");
      return;
    }

    if (parsed.command === "/download") {
      const urls = parsed.urls.slice(0, options.maxUrlsPerMessage);
      if (urls.length === 0) {
        await this.sendMessage(
          chatId,
          "Paste a media URL to download, or:\n/download <url>",
          mainReplyKeyboard()
        );
        return;
      }
      await this.handleUrls(msg, userId, urls, this.usesConfirmMenu() ? undefined : "download");
      return;
    }

    const urls = parsed.urls.slice(0, options.maxUrlsPerMessage);
    if (urls.length === 0) {
      await this.sendMessage(
        chatId,
        "No supported URL found. Tap a button below or try /help.",
        mainReplyKeyboard()
      );
      return;
    }

    await this.handleUrls(msg, userId, urls);
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.ensurePollingReady();
    this.running = true;
    this.lastError = undefined;
    this.schedulePoll(0);
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

/** Validate token and clear webhook so long polling works. */
export async function testTelegramToken(token: string): Promise<{ ok: boolean; message: string }> {
  const trimmed = normalizeTelegramToken(token);
  if (!trimmed) return { ok: false, message: "Enter a bot token first." };
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(trimmed)) {
    return {
      ok: false,
      message: 'Token format looks wrong. Paste only the token from @BotFather (e.g. 123456789:ABC…).',
    };
  }

  try {
    const base = `https://api.telegram.org/bot${trimmed}`;
    await fetch(`${base}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    const res = await fetch(`${base}/getMe`);
    const data = (await res.json()) as TelegramApiResponse<{
      username?: string;
      first_name?: string;
    }>;
    if (!data.ok) {
      return {
        ok: false,
        message: formatTelegramError(data.description, "Telegram rejected this token."),
      };
    }
    const user = data.result?.username || data.result?.first_name || "bot";
    return { ok: true, message: `Connected — @${user} (webhook cleared for local polling)` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export { DEFAULT_BOT_OPTIONS };

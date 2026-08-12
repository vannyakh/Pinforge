import { extractMediaUrls } from "../downloadQueue";

type TelegramApiResponse<T = unknown> = {
  ok?: boolean;
  result?: T;
  description?: string;
};

export type TelegramDownloadRequest = {
  urls: string[];
  chatId: number;
  messageId: number;
};

export type TelegramBotCallbacks = {
  onDownloadRequest: (req: TelegramDownloadRequest) => void | Promise<void>;
};

export class TelegramBot {
  private readonly token: string;
  private readonly callbacks: TelegramBotCallbacks;
  private offset = 0;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private username: string | undefined;
  private lastError: string | undefined;

  constructor(token: string, callbacks: TelegramBotCallbacks) {
    this.token = token.trim();
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
      throw new Error(data.description || `Telegram ${method} failed (${res.status})`);
    }
    return data.result as T;
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.call("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
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
          message?: {
            message_id: number;
            chat: { id: number };
            text?: string;
          };
        }>
      >("getUpdates", { offset: this.offset, timeout: 25, allowed_updates: ["message"] });

      for (const update of updates) {
        this.offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text?.trim()) continue;
        await this.handleMessage(msg.chat.id, msg.message_id, msg.text.trim());
      }
      this.lastError = undefined;
      this.schedulePoll(100);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.schedulePoll(5000);
    }
  }

  private async handleMessage(chatId: number, messageId: number, text: string): Promise<void> {
    if (text === "/start" || text === "/help") {
      await this.sendMessage(
        chatId,
        "Send a media URL and Pinforge will download it.\n\nCommands:\n/help — this message\n/status — bot status"
      );
      return;
    }

    if (text === "/status") {
      await this.sendMessage(chatId, this.running ? "Bot is running and listening for URLs." : "Bot stopped.");
      return;
    }

    const urls = extractMediaUrls(text);
    if (urls.length === 0) {
      await this.sendMessage(chatId, "No supported URL found. Paste a link to a video or image page.");
      return;
    }

    await this.callbacks.onDownloadRequest({ urls, chatId, messageId });
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
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, message: "Enter a bot token first." };

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
      return { ok: false, message: data.description || "Telegram rejected this token." };
    }
    const user = data.result?.username || data.result?.first_name || "bot";
    return { ok: true, message: `Connected — @${user} (webhook cleared for local polling)` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

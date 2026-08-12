import { clipboard, type BrowserWindow } from "electron";
import { getStore } from "./store";
import { appendToPendingQueue, extractMediaUrls } from "./downloadQueue";

let timer: ReturnType<typeof setInterval> | null = null;
let lastSnapshot = "";

function notifyQueueUpdated(win: BrowserWindow, added: number): void {
  if (win.isDestroyed()) return;
  win.webContents.send("queue:updated", { added });
}

/** Poll clipboard; emit detected URLs to the renderer or append to store queue in background mode. */
export function startClipboardMonitor(getWindow: () => BrowserWindow | null): void {
  if (timer) return;
  timer = setInterval(() => {
    const store = getStore();
    if (!store.get("clipboardMonitor")) return;

    const background = Boolean(store.get("clipboardMonitorBackground"));
    const win = getWindow();
    if (!background && (!win || win.isDestroyed() || !win.isFocused())) return;

    let text: string;
    try {
      text = clipboard.readText();
    } catch {
      return;
    }
    if (!text || text === lastSnapshot) return;
    lastSnapshot = text;

    const urls = extractMediaUrls(text);
    if (urls.length === 0) return;

    if (background) {
      const added = appendToPendingQueue(urls);
      if (added > 0 && win && !win.isDestroyed()) notifyQueueUpdated(win, added);
      return;
    }

    if (win && !win.isDestroyed()) {
      win.webContents.send("clipboard:urls", { urls });
    }
  }, 900);
}

export function stopClipboardMonitor(): void {
  if (timer) clearInterval(timer);
  timer = null;
  lastSnapshot = "";
}

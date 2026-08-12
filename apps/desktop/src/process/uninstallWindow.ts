/**
 * Dedicated uninstall goodbye window (separate from the main app window).
 */

import { BrowserWindow, ipcMain, app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { INSTALLER_HEIGHT, INSTALLER_WIDTH } from "./windowInstaller";

const UNINSTALL_MODE_QUERY = "mode=uninstall";

let uninstallWin: BrowserWindow | null = null;

export function isUninstallWindow(win: BrowserWindow | null | undefined): boolean {
  return Boolean(win && uninstallWin && !uninstallWin.isDestroyed() && win.id === uninstallWin.id);
}

function hideNativeButtons(win: BrowserWindow): void {
  if (process.platform !== "darwin") return;
  try {
    win.setWindowButtonVisibility(false);
  } catch {
    /* ignore */
  }
}

function loadUninstallPage(win: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const base = process.env.ELECTRON_RENDERER_URL.replace(/\/$/, "");
    void win.loadURL(`${base}/?${UNINSTALL_MODE_QUERY}`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"), {
      search: UNINSTALL_MODE_QUERY,
    });
  }
}

/** Open (or focus) the uninstall window; main app window stays open. */
export function openUninstallWindow(): { ok: boolean; message?: string } {
  if (uninstallWin && !uninstallWin.isDestroyed()) {
    uninstallWin.focus();
    return { ok: true };
  }

  const iconPath = join(__dirname, "../../resources/icon.png");
  const parent =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((w) => !isUninstallWindow(w)) ??
    undefined;

  const win = new BrowserWindow({
    width: INSTALLER_WIDTH,
    height: INSTALLER_HEIGHT,
    minWidth: INSTALLER_WIDTH,
    minHeight: INSTALLER_HEIGHT,
    show: false,
    frame: false,
    title: "Uninstall Pinforge",
    resizable: false,
    maximizable: false,
    minimizable: false,
    closable: true,
    transparent: true,
    backgroundColor: "#00000000",
    ...(parent && !parent.isDestroyed() ? { parent, modal: true } : {}),
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  uninstallWin = win;
  win.center();
  hideNativeButtons(win);

  let shown = false;
  const showOnce = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    hideNativeButtons(win);
    win.show();
    win.focus();
  };

  const onRendererReady = (event: Electron.IpcMainEvent) => {
    if (event.sender === win.webContents) showOnce();
  };
  ipcMain.on("renderer:ready", onRendererReady);

  win.on("closed", () => {
    ipcMain.removeListener("renderer:ready", onRendererReady);
    if (uninstallWin === win) uninstallWin = null;
  });

  win.once("ready-to-show", () => {
    setTimeout(showOnce, 1200);
  });

  loadUninstallPage(win);
  return { ok: true };
}

/** Close the uninstall window if open (does not quit the app). */
export function closeUninstallWindow(): void {
  if (uninstallWin && !uninstallWin.isDestroyed()) {
    uninstallWin.close();
  }
  uninstallWin = null;
}

export function registerUninstallWindowIpc(): void {
  ipcMain.handle("app:openUninstallWindow", () => openUninstallWindow());
}

// Ensure we don't leave a stale ref if the app quits
app.on("before-quit", () => {
  uninstallWin = null;
});

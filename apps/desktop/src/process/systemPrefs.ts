import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import { join } from "node:path";
import { getStore, type SystemConfig } from "./store";

let tray: Tray | null = null;
let quitting = false;

export function isAppQuitting(): boolean {
  return quitting;
}

export function markAppQuitting(): void {
  quitting = true;
}

export function applyLoginItem(system: SystemConfig): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: system.startOnBoot,
      openAsHidden: false,
    });
  } catch {
    // Unsupported on some Linux DEs
  }
}

export function applySystemPrefs(system: SystemConfig): void {
  applyLoginItem(system);
  const win = BrowserWindow.getAllWindows()[0];
  if (system.closeToTray && win) ensureTray(win);
  if (!system.closeToTray) destroyTray();
}

function trayIcon(): Electron.NativeImage {
  const iconPath = join(__dirname, "../../resources/icon.png");
  const img = nativeImage.createFromPath(iconPath);
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

export function ensureTray(win: BrowserWindow): void {
  if (tray) return;
  const icon = trayIcon();
  if (icon.isEmpty()) return;

  tray = new Tray(icon);
  tray.setToolTip("Pinforge");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Pinforge",
        click: () => {
          win.show();
          win.focus();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          markAppQuitting();
          app.quit();
        },
      },
    ])
  );
  tray.on("double-click", () => {
    win.show();
    win.focus();
  });
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

export function wireCloseToTray(win: BrowserWindow): void {
  win.on("close", (e) => {
    const system = getStore().get("system");
    if (system?.closeToTray && !quitting) {
      e.preventDefault();
      ensureTray(win);
      win.hide();
    }
  });
}

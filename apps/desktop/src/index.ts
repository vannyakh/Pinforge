import { app, BrowserWindow, ipcMain, shell, protocol, net } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpc } from "./process/ipc";
import { getStore } from "./process/store";
import { initAutoUpdater } from "./process/autoUpdater";
import { recoverJobsOnStartup } from "./process/mediacore";
import { applyLoginItem, markAppQuitting, wireCloseToTray } from "./process/systemPrefs";
import {
  INSTALLER_HEIGHT,
  INSTALLER_WIDTH,
  markInstallerWindowStarted,
} from "./process/windowInstaller";
import { isUninstallWindow } from "./process/uninstallWindow";
import { startClipboardMonitor } from "./process/clipboardMonitor";
import { shutdownRemoteRuntime } from "./process/services/remoteRuntime";

let mainWindow: BrowserWindow | null = null;

function resolvePinmediaFilePath(requestUrl: string): string | null {
  try {
    const u = new URL(requestUrl);

    if (/^[a-zA-Z]:$/.test(u.hostname)) {
      const raw = `${u.hostname}${decodeURI(u.pathname)}`;
      return process.platform === "win32" ? raw.replace(/\//g, "\\") : raw;
    }

    if (/^[a-zA-Z]$/.test(u.hostname) && u.pathname.startsWith("/")) {
      const raw = `${u.hostname}:${decodeURI(u.pathname)}`;
      return process.platform === "win32" ? raw.replace(/\//g, "\\") : raw.replace(/\\/g, "/");
    }

    if (!u.hostname || u.hostname === "local") {
      let path = decodeURI(u.pathname);
      if (process.platform === "win32") {
        if (path.startsWith("/")) path = path.slice(1);
        return path.replace(/\//g, "\\");
      }
      return path;
    }

    let raw = decodeURIComponent(requestUrl.replace(/^pinmedia:\/\//i, ""));
    raw = raw.replace(/^\/+/, "");
    if (raw.startsWith("localhost/")) raw = raw.slice("localhost/".length);
    if (process.platform === "win32") return raw.replace(/\//g, "\\");
    return raw.startsWith("/") ? raw : `/${raw}`;
  } catch {
    return null;
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "pinmedia",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

// Must run before app.ready — hardware acceleration cannot be toggled later.
{
  const store = getStore();
  const system = store.get("system");
  if (system && system.hardwareAcceleration === false) {
    app.disableHardwareAcceleration();
  }
}

function createWindow(): void {
  const store = getStore();
  const bounds = store.get("windowBounds");
  const iconPath = join(__dirname, "../../resources/icon.png");
  const needsInstaller = !Boolean(store.get("system")?.environmentSetupDone);

  const win = new BrowserWindow({
    width: needsInstaller ? INSTALLER_WIDTH : (bounds?.width ?? 1180),
    height: needsInstaller ? INSTALLER_HEIGHT : (bounds?.height ?? 780),
    x: needsInstaller ? undefined : bounds?.x,
    y: needsInstaller ? undefined : bounds?.y,
    minWidth: needsInstaller ? INSTALLER_WIDTH : 860,
    minHeight: needsInstaller ? INSTALLER_HEIGHT : 600,
    show: false,
    frame: false,
    title: needsInstaller ? "Pinforge desktop installer" : "Pinforge",
    resizable: !needsInstaller,
    maximizable: !needsInstaller,
    closable: !needsInstaller,
    // Transparent so splash / installer can use CSS rounded corners.
    // Critical CSS in index.html keeps an opaque fill until React paints.
    transparent: true,
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    backgroundColor: "#00000000",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    // Centered in the 45px mac titlebar; leave ~78px for renderer controls.
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (needsInstaller) {
    markInstallerWindowStarted(win);
    win.center();
  }

  // Wait for renderer styles+UI before showing (avoids unstyled FOUC on first load).
  let shown = false;
  const showOnce = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    if (needsInstaller) {
      try {
        win.setWindowButtonVisibility(false);
      } catch {
        /* non-darwin */
      }
    }
    win.show();
  };
  const onRendererReady = (event: Electron.IpcMainEvent) => {
    if (event.sender === win.webContents) showOnce();
  };
  ipcMain.on("renderer:ready", onRendererReady);
  win.on("closed", () => {
    ipcMain.removeListener("renderer:ready", onRendererReady);
  });
  // Fallback if the ready ping is missed
  win.once("ready-to-show", () => {
    setTimeout(showOnce, 2500);
  });

  const emitMaximized = () => {
    win.webContents.send("window:maximizedChanged", win.isMaximized());
  };
  win.on("maximize", emitMaximized);
  win.on("unmaximize", emitMaximized);

  win.on("close", () => {
    if (!win.isVisible()) return;
    store.set("windowBounds", win.getBounds());
  });

  wireCloseToTray(win);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  if (!needsInstaller) mainWindow = win;
}

app.whenReady().then(() => {
  protocol.handle("pinmedia", async (request) => {
    try {
      const filePath = resolvePinmediaFilePath(request.url);
      if (!filePath || !existsSync(filePath)) {
        return new Response("", { status: 404, statusText: "Not Found" });
      }
      return net.fetch(pathToFileURL(filePath).href);
    } catch {
      return new Response("", { status: 404, statusText: "Not Found" });
    }
  });

  applyLoginItem(getStore().get("system"));
  registerIpc();
  createWindow();
  startClipboardMonitor(() => mainWindow);
  initAutoUpdater();

  // Mark crash-interrupted downloads as paused for resume UI
  void recoverJobsOnStartup().catch(() => undefined);

  app.on("activate", () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      createWindow();
      return;
    }
    const main = windows.find((w) => !isUninstallWindow(w)) ?? windows[0];
    main?.show();
  });
});

app.on("before-quit", () => {
  markAppQuitting();
  void shutdownRemoteRuntime().catch(() => undefined);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

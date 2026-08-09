import { app, BrowserWindow, shell, protocol, net } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpc } from "./process/ipc";
import { getStore } from "./process/store";
import {
  applyLoginItem,
  markAppQuitting,
  wireCloseToTray,
} from "./process/systemPrefs";

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

  const win = new BrowserWindow({
    width: bounds?.width ?? 1180,
    height: bounds?.height ?? 780,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 860,
    minHeight: 600,
    show: false,
    frame: false,
    title: "Pinforge",
    icon: join(__dirname, "../../resources/icon.png"),
    backgroundColor: "#0e0e0e",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on("ready-to-show", () => win.show());

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
}

app.whenReady().then(() => {
  protocol.handle("pinmedia", (request) => {
    let raw = decodeURIComponent(request.url.replace(/^pinmedia:\/\//, ""));
    raw = raw.replace(/^\/+/, "");
    if (raw.startsWith("localhost/")) raw = raw.slice("localhost/".length);
    const filePath = process.platform === "win32" ? raw.replace(/\//g, "\\") : `/${raw}`;
    return net.fetch(pathToFileURL(filePath).href);
  });

  applyLoginItem(getStore().get("system"));
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else BrowserWindow.getAllWindows()[0]?.show();
  });
});

app.on("before-quit", () => {
  markAppQuitting();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

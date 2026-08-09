import { ipcMain, dialog, shell, BrowserWindow, type IpcMainInvokeEvent } from "electron";
import {
  processMedia,
  listProviders,
  detectProvider,
  PRESETS,
  type PresetName,
  type FormatPreset,
  type ProcessResult,
} from "@pinterest-desktop/core";
import { getStore, type DownloadPack, type HistoryItem, type PackStatus } from "./store";

function emitProgress(
  e: IpcMainInvokeEvent,
  payload: {
    packId: string;
    url: string;
    current: number;
    total: number;
    status: PackStatus;
    title?: string;
    message?: string;
  }
): void {
  e.sender.send("media:progress", payload);
}

function upsertPack(pack: DownloadPack): void {
  const store = getStore();
  const packs = store.get("packs").filter((p) => p.id !== pack.id);
  store.set("packs", [pack, ...packs].slice(0, 50));
}

function pushHistory(items: HistoryItem[]): void {
  const store = getStore();
  const prev = store.get("history");
  store.set("history", [...items, ...prev].slice(0, 200));
}

function toHistory(
  url: string,
  preset: PresetName,
  packId: string,
  results: ProcessResult[]
): HistoryItem[] {
  const now = Date.now();
  return results.map((r, i) => ({
    id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    outPath: r.outPath,
    originalPath: r.originalPath,
    title: r.title,
    preset,
    provider: r.provider,
    kind: r.kind,
    packId,
    createdAt: now + i,
  }));
}

async function runProcess(
  e: IpcMainInvokeEvent,
  payload: {
    url: string;
    preset: PresetName;
    outDir: string;
    enhance?: boolean;
    format?: FormatPreset;
  }
) {
  const store = getStore();
  const { url, preset, outDir } = payload;
  const enhance = payload.enhance ?? store.get("enhance");
  const format = payload.format ?? store.get("format");
  const extractorUrl = store.get("extractorUrl") || undefined;

  store.set("preset", preset);
  store.set("outDir", outDir);
  store.set("enhance", enhance);
  store.set("format", format);

  const packId = `pack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = Date.now();
  const runningPack: DownloadPack = {
    id: packId,
    url,
    status: "running",
    preset,
    itemIds: [],
    errorCount: 0,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
  upsertPack(runningPack);
  emitProgress(e, { packId, url, current: 0, total: 1, status: "running", message: "Starting…" });

  try {
    const res = await processMedia(url, {
      preset,
      outDir,
      enhance,
      format,
      extractorUrl,
      delayMs: store.get("delayMs"),
      onProgress: (info) => {
        emitProgress(e, {
          packId,
          url,
          current: info.current,
          total: info.total,
          status: "running",
          title: info.result?.title,
          message: info.error
            ? info.error
            : `Saving ${info.current}/${info.total}…`,
        });
      },
    });

    const items = toHistory(url, preset, packId, res.results);
    pushHistory(items);

    const status: PackStatus =
      res.errors.length === 0 ? "done" : res.results.length === 0 ? "failed" : "partial";

    const pack: DownloadPack = {
      id: packId,
      url,
      title: res.results[0]?.title ?? items[0]?.title,
      provider: res.provider,
      status,
      preset,
      itemIds: items.map((i) => i.id),
      errorCount: res.errors.length,
      createdAt: startedAt,
      updatedAt: Date.now(),
    };
    upsertPack(pack);

    emitProgress(e, {
      packId,
      url,
      current: res.results.length,
      total: res.results.length + res.errors.length || 1,
      status,
      title: pack.title,
      message:
        status === "done"
          ? "Done"
          : status === "partial"
            ? `Saved ${res.results.length}, ${res.errors.length} failed`
            : res.errors[0]?.error ?? "Failed",
    });

    return {
      kind: res.kind === "batch" ? ("board" as const) : ("pin" as const),
      provider: res.provider,
      packId,
      pack,
      results: res.results,
      errors: res.errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const pack: DownloadPack = {
      ...runningPack,
      status: "failed",
      errorCount: 1,
      updatedAt: Date.now(),
    };
    upsertPack(pack);
    emitProgress(e, {
      packId,
      url,
      current: 0,
      total: 1,
      status: "failed",
      message,
    });
    throw err;
  }
}

export function registerIpc(): void {
  ipcMain.handle("media:process", async (e, payload) => runProcess(e, payload));
  ipcMain.handle("pin:process", async (e, payload) => runProcess(e, payload));

  ipcMain.handle("media:detect", async (_e, url: string) => {
    try {
      const p = detectProvider(url);
      return {
        id: p.id,
        label: p.label,
        live: p.live,
        formats: p.formats ?? [],
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle("media:providers", async () => listProviders());

  ipcMain.handle("pin:pickFolder", async () => {
    const store = getStore();
    const res = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      defaultPath: store.get("outDir"),
    });
    if (res.canceled || !res.filePaths[0]) return null;
    store.set("outDir", res.filePaths[0]);
    return res.filePaths[0];
  });

  ipcMain.handle("settings:get", async () => {
    const store = getStore();
    return {
      outDir: store.get("outDir"),
      preset: store.get("preset"),
      delayMs: store.get("delayMs"),
      enhance: store.get("enhance"),
      format: store.get("format"),
      extractorUrl: store.get("extractorUrl"),
      history: store.get("history"),
      packs: store.get("packs"),
      remote: store.get("remote"),
      presets: PRESETS,
      providers: listProviders(),
    };
  });

  ipcMain.handle(
    "settings:set",
    async (
      _e,
      partial: Partial<{
        outDir: string;
        preset: PresetName;
        delayMs: number;
        enhance: boolean;
        format: FormatPreset;
        extractorUrl: string;
      }>
    ) => {
      const store = getStore();
      if (partial.outDir !== undefined) store.set("outDir", partial.outDir);
      if (partial.preset !== undefined) store.set("preset", partial.preset);
      if (partial.delayMs !== undefined) store.set("delayMs", partial.delayMs);
      if (partial.enhance !== undefined) store.set("enhance", partial.enhance);
      if (partial.format !== undefined) store.set("format", partial.format);
      if (partial.extractorUrl !== undefined) store.set("extractorUrl", partial.extractorUrl);
      return {
        outDir: store.get("outDir"),
        preset: store.get("preset"),
        delayMs: store.get("delayMs"),
        enhance: store.get("enhance"),
        format: store.get("format"),
        extractorUrl: store.get("extractorUrl"),
      };
    }
  );

  ipcMain.handle("history:clear", async () => {
    const store = getStore();
    store.set("history", []);
    store.set("packs", []);
    return true;
  });

  ipcMain.handle("remote:get", async () => getStore().get("remote"));

  ipcMain.handle("remote:set", async (_e, partial: { channels?: unknown; tunnel?: object }) => {
    const store = getStore();
    const prev = store.get("remote");
    const next = {
      channels: (partial.channels as typeof prev.channels) ?? prev.channels,
      tunnel: { ...prev.tunnel, ...(partial.tunnel ?? {}) },
    };
    store.set("remote", next);
    return next;
  });

  ipcMain.handle("remote:upsertChannel", async (_e, channel: { id: string }) => {
    const store = getStore();
    const remote = store.get("remote");
    const idx = remote.channels.findIndex((c) => c.id === channel.id);
    const channels = [...remote.channels];
    if (idx >= 0) channels[idx] = { ...channels[idx]!, ...channel } as (typeof channels)[number];
    else channels.push(channel as (typeof channels)[number]);
    const next = { ...remote, channels };
    store.set("remote", next);
    return next;
  });

  ipcMain.handle("shell:showItem", async (_e, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("shell:openPath", async (_e, filePath: string) => {
    return shell.openPath(filePath);
  });

  ipcMain.handle("window:minimize", (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });

  ipcMain.handle("window:toggleMaximize", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle("window:close", (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });

  ipcMain.handle("window:isMaximized", (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
  });
}

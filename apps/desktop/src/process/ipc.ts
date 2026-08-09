import { ipcMain, dialog, shell, BrowserWindow, type IpcMainInvokeEvent } from "electron";
import {
  processMedia,
  listProviders,
  detectProvider,
  extractMediaPreview,
  PRESETS,
  DEFAULT_ENHANCE_FEATURES,
  DEFAULT_YOUTUBE_OPTIONS,
  DEFAULT_PINTEREST_OPTIONS,
  configurePinterestCookies,
  zipFolder,
  type PresetName,
  type FormatPreset,
  type ProcessResult,
  type EnhanceFeatures,
  type YoutubeDownloadOptions,
  type PinterestOptions,
} from "@pinterest-desktop/core";
import {
  getStore,
  resolveSystemPaths,
  type DownloadPack,
  type HistoryItem,
  type PackStatus,
  type SystemConfig,
  type CustomProviderConfig,
} from "./store";
import { applySystemPrefs } from "./systemPrefs";
import {
  findManifestPath,
  installFormatPlugin,
  installProviderFromSource,
  readProviderManifest,
} from "./providerInstall";
import { getFfmpegStatus, installFfmpeg, resolveConfiguredFfmpeg } from "./ffmpegInstall";

/** Active download abort — Tasks Stop cancels the current job. */
let activeAbort: AbortController | null = null;

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
    percent?: number;
    downloaded?: number;
    totalBytes?: number | null;
    phase?: string;
    etaSec?: number | null;
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
    features?: Partial<EnhanceFeatures>;
    youtube?: YoutubeDownloadOptions;
    pinterest?: PinterestOptions;
  }
) {
  const store = getStore();
  const { url, preset, outDir } = payload;
  const enhance = payload.enhance ?? store.get("enhance");
  const features = {
    ...DEFAULT_ENHANCE_FEATURES,
    ...store.get("enhanceFeatures"),
    ...payload.features,
  };
  const youtube = {
    ...DEFAULT_YOUTUBE_OPTIONS,
    ...store.get("youtube"),
    ...payload.youtube,
  };
  const pinterest = {
    ...DEFAULT_PINTEREST_OPTIONS,
    ...store.get("pinterest"),
    ...payload.pinterest,
  };
  configurePinterestCookies(pinterest.cookies);

  // Provider extension overrides (engine / format / extractor / plugins)
  let providerCfg: CustomProviderConfig | undefined;
  try {
    const detected = detectProvider(url);
    providerCfg = (store.get("customProviders") ?? []).find((p) => p.id === detected.id);
  } catch {
    providerCfg = undefined;
  }

  const format =
    payload.format ??
    (providerCfg?.format as FormatPreset | undefined) ??
    store.get("format");
  const extractorUrl =
    providerCfg?.extractorUrl?.trim() || store.get("extractorUrl") || undefined;
  const enabledPlugins = (providerCfg?.formatPlugins ?? []).filter((p) => p.enabled);

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
  const pluginHint =
    enabledPlugins.length > 0
      ? ` · ${enabledPlugins.length} format plugin${enabledPlugins.length === 1 ? "" : "s"}`
      : "";
  emitProgress(e, {
    packId,
    url,
    current: 0,
    total: 1,
    status: "running",
    percent: 0,
    phase: "start",
    message: `Starting${providerCfg?.engine ? ` (${providerCfg.engine})` : ""}${pluginHint}…`,
  });

  const abort = new AbortController();
  activeAbort?.abort();
  activeAbort = abort;

  try {
    const { configureFfmpeg } = await import("@pinterest-desktop/core");
    const ffPath = await resolveConfiguredFfmpeg();
    const system = store.get("system");
    configureFfmpeg({
      path: ffPath ?? system.ffmpegPath ?? undefined,
      enabled: Boolean(system.ffmpegEnabled) && Boolean(ffPath),
    });

    const progressStartedAt = Date.now();
    let lastDownloaded = 0;

    const res = await processMedia(url, {
      preset,
      outDir,
      enhance,
      features,
      format,
      youtube,
      pinterest,
      extractorUrl,
      delayMs: store.get("delayMs"),
      itemConcurrency: 3,
      fragmentConcurrency: 4,
      signal: abort.signal,
      onProgress: (info) => {
        if (abort.signal.aborted) return;
        const percent =
          typeof info.percent === "number"
            ? info.percent
            : info.total > 0
              ? Math.round((info.current / info.total) * 100)
              : undefined;
        let etaSec: number | null | undefined;
        if (
          typeof info.downloaded === "number" &&
          info.totalBytes &&
          info.totalBytes > 0 &&
          info.downloaded > lastDownloaded
        ) {
          const elapsed = (Date.now() - progressStartedAt) / 1000;
          const rate = info.downloaded / Math.max(elapsed, 0.2);
          etaSec = rate > 0 ? Math.round((info.totalBytes - info.downloaded) / rate) : null;
          lastDownloaded = info.downloaded;
        }
        emitProgress(e, {
          packId,
          url,
          current: info.current,
          total: info.total,
          status: "running",
          title: info.title ?? info.result?.title,
          percent,
          downloaded: info.downloaded,
          totalBytes: info.totalBytes,
          phase: info.phase,
          etaSec,
          message: info.error
            ? info.error
            : info.phase === "mux"
              ? "Merging…"
              : info.phase === "convert"
                ? "Converting…"
                : typeof percent === "number"
                  ? `Downloading ${percent}%`
                  : `Saving ${info.current}/${info.total}…`,
        });
      },
    });

    if (abort.signal.aborted) {
      const stopErr = new Error("Download stopped");
      stopErr.name = "AbortError";
      throw stopErr;
    }

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
    const aborted =
      abort.signal.aborted ||
      (err instanceof Error && (err.name === "AbortError" || /aborted|stopped/i.test(err.message)));
    const message = aborted
      ? "Stopped"
      : err instanceof Error
        ? err.message
        : String(err);
    const pack: DownloadPack = {
      ...runningPack,
      status: aborted ? "partial" : "failed",
      errorCount: aborted ? 0 : 1,
      updatedAt: Date.now(),
    };
    upsertPack(pack);
    emitProgress(e, {
      packId,
      url,
      current: 0,
      total: 1,
      status: pack.status,
      message,
    });
    if (aborted) {
      return {
        kind: "pin" as const,
        provider: undefined,
        packId,
        pack,
        results: [],
        errors: [{ url, error: "Stopped" }],
      };
    }
    throw err;
  } finally {
    if (activeAbort === abort) activeAbort = null;
  }
}

export function registerIpc(): void {
  try {
    const pin = getStore().get("pinterest");
    configurePinterestCookies(pin?.cookies);
  } catch {
    /* store may not be ready */
  }

  ipcMain.handle("media:process", async (e, payload) => runProcess(e, payload));
  ipcMain.handle("pin:process", async (e, payload) => runProcess(e, payload));
  ipcMain.handle("media:cancel", async () => {
    if (!activeAbort) return { ok: false, message: "No active download" };
    activeAbort.abort();
    return { ok: true, message: "Stopping…" };
  });

  ipcMain.handle("media:detect", async (_e, url: string) => {
    try {
      const p = detectProvider(url);
      return {
        id: p.id,
        label: p.label,
        live: p.live,
        formats: p.formats ?? [],
        modes: p.modes ?? ["single"],
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    "media:extract",
    async (
      _e,
      url: string,
      opts?: {
        channelMaxVideos?: number;
        playlistMaxVideos?: number;
        boardMaxPins?: number;
        preferPlaylist?: boolean;
      }
    ) => {
    try {
      const store = getStore();
      const youtube = {
        ...DEFAULT_YOUTUBE_OPTIONS,
        ...store.get("youtube"),
      };
      const pinterest = {
        ...DEFAULT_PINTEREST_OPTIONS,
        ...store.get("pinterest"),
      };
      configurePinterestCookies(pinterest.cookies);
      return await extractMediaPreview(url, {
        channelMaxVideos: opts?.channelMaxVideos ?? youtube.channelMaxVideos,
        playlistMaxVideos: opts?.playlistMaxVideos ?? youtube.playlistMaxVideos,
        boardMaxPins: opts?.boardMaxPins ?? pinterest.boardMaxPins,
        preferPlaylist: opts?.preferPlaylist,
      });
    } catch (err) {
      return {
        sourceUrl: typeof url === "string" ? url : "",
        provider: { id: "unknown", label: "Unknown", live: false },
        mode: "single",
        modeSupported: false,
        formats: [],
        supportedModes: [],
        items: [],
        itemCount: 0,
        message: err instanceof Error ? err.message : String(err),
      };
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

  ipcMain.handle("dialog:pickFolder", async (_e, defaultPath?: string) => {
    const store = getStore();
    const res = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      defaultPath: defaultPath || store.get("outDir"),
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("dialog:pickProviderSource", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile", "openDirectory"],
      filters: [
        { name: "Provider package", extensions: ["json", "js", "mjs", "cjs", "zip"] },
        { name: "Manifest", extensions: ["json"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("dialog:pickFormatPlugin", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Format plugin", extensions: ["js", "mjs", "cjs", "json", "zip"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("settings:get", async () => {
    const store = getStore();
    return {
      outDir: store.get("outDir"),
      preset: store.get("preset"),
      delayMs: store.get("delayMs"),
      enhance: store.get("enhance"),
      enhanceFeatures: {
        ...DEFAULT_ENHANCE_FEATURES,
        ...store.get("enhanceFeatures"),
      },
      autoDownload: store.get("autoDownload") ?? true,
      format: store.get("format"),
      youtube: {
        ...DEFAULT_YOUTUBE_OPTIONS,
        ...store.get("youtube"),
      },
      pinterest: {
        ...DEFAULT_PINTEREST_OPTIONS,
        ...store.get("pinterest"),
      },
      extractorUrl: store.get("extractorUrl"),
      history: store.get("history"),
      packs: store.get("packs"),
      remote: store.get("remote"),
      system: resolveSystemPaths(store.get("system")),
      customProviders: store.get("customProviders") ?? [],
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
        enhanceFeatures: Partial<EnhanceFeatures>;
        autoDownload: boolean;
        format: FormatPreset;
        youtube: Partial<YoutubeDownloadOptions>;
        pinterest: Partial<PinterestOptions>;
        extractorUrl: string;
        system: Partial<SystemConfig>;
      }>
    ) => {
      const store = getStore();
      if (partial.outDir !== undefined) store.set("outDir", partial.outDir);
      if (partial.preset !== undefined) store.set("preset", partial.preset);
      if (partial.delayMs !== undefined) store.set("delayMs", partial.delayMs);
      if (partial.enhance !== undefined) store.set("enhance", partial.enhance);
      if (partial.enhanceFeatures !== undefined) {
        store.set("enhanceFeatures", {
          ...DEFAULT_ENHANCE_FEATURES,
          ...store.get("enhanceFeatures"),
          ...partial.enhanceFeatures,
        });
      }
      if (partial.autoDownload !== undefined) store.set("autoDownload", partial.autoDownload);
      if (partial.format !== undefined) store.set("format", partial.format);
      if (partial.youtube !== undefined) {
        store.set("youtube", {
          ...DEFAULT_YOUTUBE_OPTIONS,
          ...store.get("youtube"),
          ...partial.youtube,
        });
      }
      if (partial.pinterest !== undefined) {
        const next = {
          ...DEFAULT_PINTEREST_OPTIONS,
          ...store.get("pinterest"),
          ...partial.pinterest,
        };
        store.set("pinterest", next);
        configurePinterestCookies(next.cookies);
      }
      if (partial.extractorUrl !== undefined) store.set("extractorUrl", partial.extractorUrl);
      if (partial.system !== undefined) {
        const next = { ...store.get("system"), ...partial.system };
        store.set("system", next);
        if (next.ffmpegEnabled) {
          const check = await getFfmpegStatus();
          if (!check.available) {
            next.ffmpegEnabled = false;
            store.set("system", next);
          }
        }
        applySystemPrefs(next);
      }
      return {
        outDir: store.get("outDir"),
        preset: store.get("preset"),
        delayMs: store.get("delayMs"),
        enhance: store.get("enhance"),
        enhanceFeatures: {
          ...DEFAULT_ENHANCE_FEATURES,
          ...store.get("enhanceFeatures"),
        },
        autoDownload: store.get("autoDownload") ?? true,
        format: store.get("format"),
        youtube: {
          ...DEFAULT_YOUTUBE_OPTIONS,
          ...store.get("youtube"),
        },
        pinterest: {
          ...DEFAULT_PINTEREST_OPTIONS,
          ...store.get("pinterest"),
        },
        extractorUrl: store.get("extractorUrl"),
        system: resolveSystemPaths(store.get("system")),
      };
    }
  );

  ipcMain.handle("history:clear", async () => {
    const store = getStore();
    store.set("history", []);
    store.set("packs", []);
    return true;
  });

  ipcMain.handle("packs:clear", async () => {
    getStore().set("packs", []);
    return true;
  });

  ipcMain.handle("packs:remove", async (_e, ids: string[]) => {
    const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (list.length === 0) return true;
    const idSet = new Set(list);
    const store = getStore();
    store.set(
      "packs",
      store.get("packs").filter((p) => !idSet.has(p.id))
    );
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

  ipcMain.handle(
    "remote:testChannel",
    async (
      _e,
      payload: { id: string; botToken?: string; webhookUrl?: string }
    ): Promise<{ ok: boolean; message: string }> => {
      const id = String(payload.id);
      const token = (payload.botToken ?? "").trim();
      const webhookUrl = (payload.webhookUrl ?? "").trim();

      try {
        if (id === "telegram" || id.startsWith("telegram")) {
          if (!token) return { ok: false, message: "Enter a bot token first." };
          const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
          const data = (await res.json()) as {
            ok?: boolean;
            result?: { username?: string; first_name?: string };
            description?: string;
          };
          if (!data.ok) {
            return { ok: false, message: data.description || "Telegram rejected this token." };
          }
          const user = data.result?.username || data.result?.first_name || "bot";
          return { ok: true, message: `Connected — @${user}` };
        }

        if (id === "discord") {
          if (!token && !webhookUrl) {
            return { ok: false, message: "Enter a bot token or webhook URL." };
          }
          if (webhookUrl) {
            if (!/^https:\/\/(discord(?:app)?\.com|discord\.com)\/api\/webhooks\//i.test(webhookUrl)) {
              return { ok: false, message: "Discord webhook URL looks invalid." };
            }
            const res = await fetch(webhookUrl);
            if (!res.ok) return { ok: false, message: `Webhook check failed (${res.status}).` };
            return { ok: true, message: "Discord webhook looks valid." };
          }
          // Bot token: lightweight format check (runtime connect comes later)
          if (token.length < 50) {
            return { ok: false, message: "Discord bot token looks too short." };
          }
          return { ok: true, message: "Token format OK. Full Discord runtime comes soon." };
        }

        if (id === "webhook" || id.startsWith("webhook")) {
          if (!webhookUrl) return { ok: false, message: "Enter a webhook URL." };
          let parsed: URL;
          try {
            parsed = new URL(webhookUrl);
          } catch {
            return { ok: false, message: "Webhook URL is not valid." };
          }
          if (!/^https?:$/i.test(parsed.protocol)) {
            return { ok: false, message: "Webhook must be http(s)." };
          }
          return { ok: true, message: "Webhook URL looks valid." };
        }

        return { ok: false, message: "This channel cannot be tested yet." };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );

  ipcMain.handle("providers:listCustom", async () => getStore().get("customProviders") ?? []);

  ipcMain.handle("providers:upsertCustom", async (_e, provider: CustomProviderConfig) => {
    const store = getStore();
    const list = [...(store.get("customProviders") ?? [])];
    const idx = list.findIndex((p) => p.id === provider.id);
    if (idx >= 0) list[idx] = { ...list[idx]!, ...provider };
    else list.push(provider);
    store.set("customProviders", list);
    return list;
  });

  ipcMain.handle("providers:removeCustom", async (_e, id: string) => {
    const store = getStore();
    const list = (store.get("customProviders") ?? []).filter((p) => p.id !== id);
    store.set("customProviders", list);
    return list;
  });

  ipcMain.handle("providers:installFromSource", async (_e, sourcePath: string) => {
    const installed = installProviderFromSource(sourcePath);
    const store = getStore();
    const list = [...(store.get("customProviders") ?? [])];
    const next: CustomProviderConfig = {
      id: installed.manifest.id,
      label: installed.manifest.name,
      enabled: false,
      hosts: (installed.manifest.hosts ?? []).join(", "),
      sourcePath: installed.installDir,
      manifestPath: installed.manifestPath,
      manifest: installed.manifest,
      engine: installed.manifest.engine ?? "script",
      format: installed.manifest.formats?.[0],
      notes: installed.manifest.description,
      version: installed.manifest.version,
      formatPlugins: [],
      createdAt: Date.now(),
    };
    const idx = list.findIndex((p) => p.id === next.id);
    if (idx >= 0) list[idx] = { ...list[idx]!, ...next, createdAt: list[idx]!.createdAt };
    else list.push(next);
    store.set("customProviders", list);
    return { provider: next, providers: list };
  });

  ipcMain.handle("providers:readManifest", async (_e, pathOrDir: string) => {
    const manifestPath = findManifestPath(pathOrDir);
    if (!manifestPath) return null;
    return { path: manifestPath, manifest: readProviderManifest(manifestPath) };
  });

  ipcMain.handle("providers:uploadFormatPlugin", async (_e, sourcePath: string) => {
    return installFormatPlugin(sourcePath);
  });

  ipcMain.handle("shell:showItem", async (_e, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("shell:openPath", async (_e, filePath: string) => {
    try {
      const { mkdirSync, existsSync, statSync } = await import("node:fs");
      if (!existsSync(filePath)) {
        mkdirSync(filePath, { recursive: true });
      } else if (!statSync(filePath).isDirectory()) {
        // file path — open as-is
      }
    } catch {
      // ignore mkdir failures
    }
    return shell.openPath(filePath);
  });

  ipcMain.handle("shell:openExternal", async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("fs:diskSpace", async (_e, dirPath?: string) => {
    const target = (dirPath || getStore().get("outDir") || "").trim();
    if (!target) return null;
    try {
      const { existsSync, mkdirSync } = await import("node:fs");
      const { statfs } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      let probe = target;
      if (!existsSync(probe)) {
        try {
          mkdirSync(probe, { recursive: true });
        } catch {
          probe = dirname(probe);
        }
      }
      const s = await statfs(probe);
      const bsize = Number(s.bsize) || 0;
      return {
        path: target,
        free: Number(s.bavail) * bsize,
        total: Number(s.blocks) * bsize,
      };
    } catch {
      return null;
    }
  });

  /** Previous CPU times for delta usage (main process). */
  let prevCpuSample: { idle: number; total: number } | null = null;

  ipcMain.handle("system:resources", async () => {
    const os = await import("node:os");
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      const t = cpu.times;
      idle += t.idle;
      const steal = "steal" in t ? Number((t as { steal?: number }).steal ?? 0) : 0;
      total += t.user + t.nice + t.sys + t.idle + t.irq + steal;
    }
    let cpuPercent = 0;
    if (prevCpuSample && total > prevCpuSample.total) {
      const dIdle = idle - prevCpuSample.idle;
      const dTotal = total - prevCpuSample.total;
      cpuPercent = Math.max(0, Math.min(100, Math.round((1 - dIdle / dTotal) * 100)));
    }
    prevCpuSample = { idle, total };

    const memTotal = os.totalmem();
    const memFree = os.freemem();
    return {
      cpuPercent,
      cpuCount: cpus.length,
      memory: {
        used: Math.max(0, memTotal - memFree),
        free: memFree,
        total: memTotal,
      },
    };
  });

  ipcMain.handle("fs:fileSizes", async (_e, paths: string[]) => {
    const list = Array.isArray(paths) ? paths.filter(Boolean).slice(0, 500) : [];
    const { stat } = await import("node:fs/promises");
    const out: Record<string, number> = {};
    await Promise.all(
      list.map(async (p) => {
        try {
          out[p] = (await stat(p)).size;
        } catch {
          // missing file
        }
      })
    );
    return out;
  });

  ipcMain.handle("fs:zipFolder", async (_e, folderPath: string, outZipPath?: string) => {
    if (!folderPath || typeof folderPath !== "string") {
      throw new Error("Folder path is required");
    }
    const zipPath = await zipFolder(folderPath, outZipPath);
    return { zipPath };
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
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    const system = getStore().get("system");
    if (system?.closeToTray) {
      win.close(); // close handler hides when tray enabled
      return;
    }
    win.close();
  });

  ipcMain.handle("window:isMaximized", (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle("tools:ffmpegStatus", async () => getFfmpegStatus());

  ipcMain.handle("tools:ffmpegInstall", async (e) => {
    const send = (payload: {
      phase: string;
      percent: number;
      message: string;
    }) => {
      e.sender.send("tools:ffmpegProgress", payload);
    };
    return installFfmpeg((ev) => send(ev));
  });

  ipcMain.handle("tools:ffmpegPick", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters:
        process.platform === "win32"
          ? [{ name: "ffmpeg", extensions: ["exe"] }]
          : [{ name: "ffmpeg", extensions: ["*"] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const bin = res.filePaths[0];
    const store = getStore();
    const system = store.get("system");
    store.set("system", { ...system, ffmpegPath: bin });
    const status = await getFfmpegStatus();
    return status;
  });
}

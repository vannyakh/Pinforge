import { app, ipcMain, dialog, shell, BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { listProviders, configurePinterestCookies, configureYtdlp } from "@pinforge/core/providers";
import { extractMediaPreview } from "@pinforge/core/preview";
import {
  PRESETS,
  DEFAULT_ENHANCE_FEATURES,
  DEFAULT_YOUTUBE_OPTIONS,
  DEFAULT_PINTEREST_OPTIONS,
  DEFAULT_NAMING_TEMPLATES,
  type PresetName,
  type FormatPreset,
  type ProcessResult,
  type EnhanceFeatures,
  type YoutubeDownloadOptions,
  type PinterestOptions,
  type NamingTemplates,
} from "@pinforge/core/types";
import { configureFfmpeg } from "@pinforge/core/tools";
import { zipFolder } from "@pinforge/core/zip";
import type { DownloadJob, JobStatus, CancelJobOptions } from "@pinforge/core/jobs";
import { syncRecoveredJobsToPacks } from "./jobRecovery";
import {
  getStore,
  resolveSystemPaths,
  type DownloadPack,
  type HistoryItem,
  type PackStatus,
  type PendingQueueJob,
  type SystemConfig,
  type CustomProviderConfig,
} from "./store";
import { applySystemPrefs } from "./systemPrefs";
import {
  findManifestPath,
  installFormatPlugin,
  installProviderFromSource,
  readProviderManifest,
  uninstallProviderFiles,
} from "./providerInstall";
import {
  ProviderDisabledError,
  buildInstalledViews,
  buildRegistryList,
  getProviderPrefs,
  resolveProviderForUrl,
  setProviderEnabled,
} from "./providerResolve";
import { PROVIDER_REGISTRY } from "../common/providers/types";
import { getFfmpegStatus, installFfmpeg, resolveConfiguredFfmpeg } from "./ffmpegInstall";
import { getYtdlpStatus, installYtdlp, resolveConfiguredYtdlp } from "./ytdlpInstall";
import { getPlaywrightStatus, installPlaywrightChromium } from "./playwrightInstall";
import {
  completeEnvironmentSetup,
  getEnvironmentSetupStatus,
  runEnvironmentSetup,
} from "./environmentSetup";
import { enterInstallerWindow, exitInstallerWindow } from "./windowInstaller";
import { checkForUpdates, downloadUpdate, getUpdateStatus, quitAndInstall } from "./autoUpdater";
import { ensureMediaCore } from "./mediacore";
import { uninstallApp } from "./appUninstall";
import { isUninstallWindow, registerUninstallWindowIpc } from "./uninstallWindow";
import {
  getRemoteRuntimeStatus,
  notifyRemoteDownloadComplete,
  notifyTelegramAccessDecision,
  syncRemoteRuntime,
} from "./services/remoteRuntime";
import { listRemoteUsers, removeRemoteUser, setRemoteUserStatus } from "./services/remoteAccess";
import { testTelegramToken, normalizeTelegramToken } from "./channels/telegram";

type ActiveRun = { abort: AbortController; jobId: string; packId: string };
const activeRuns = new Map<string, ActiveRun>();

function maxParallelDownloads(): number {
  const n = getStore().get("maxParallelDownloads") ?? 2;
  return Math.max(1, Math.min(3, Math.floor(n) || 1));
}

function registerActiveRun(jobId: string, packId: string, abort: AbortController): void {
  activeRuns.set(jobId, { abort, jobId, packId });
}

function unregisterActiveRun(jobId: string): void {
  activeRuns.delete(jobId);
}

/** Abort all active runs (used when maxParallel is 1 and a new download starts). */
function abortAllActiveRuns(): void {
  for (const run of activeRuns.values()) run.abort.abort();
  activeRuns.clear();
}

function acquireRunSlot(abortPrevious: boolean): void {
  const max = maxParallelDownloads();
  if (activeRuns.size >= max) {
    throw new Error(
      `Maximum ${max} simultaneous download${max === 1 ? "" : "s"} — pause one or wait for a slot`
    );
  }
  if (max === 1 && abortPrevious && activeRuns.size > 0) abortAllActiveRuns();
}

async function configureDownloadTools(
  core: ReturnType<typeof ensureMediaCore>,
  store: ReturnType<typeof getStore>
): Promise<void> {
  const [ffPath, ytdlpPath] = await Promise.all([
    resolveConfiguredFfmpeg(),
    resolveConfiguredYtdlp(),
  ]);
  const system = store.get("system");
  configureFfmpeg({
    path: ffPath ?? system.ffmpegPath ?? undefined,
    enabled: Boolean(system.ffmpegEnabled) && Boolean(ffPath),
  });
  core.tools.configureFfmpeg({
    path: ffPath ?? system.ffmpegPath ?? undefined,
    enabled: Boolean(system.ffmpegEnabled) && Boolean(ffPath),
  });
  configureYtdlp({
    path: ytdlpPath ?? system.ytdlpPath ?? undefined,
    enabled: Boolean(system.ytdlpEnabled) && Boolean(ytdlpPath),
  });
  core.tools.configureYtdlp({
    path: ytdlpPath ?? system.ytdlpPath ?? undefined,
    enabled: Boolean(system.ytdlpEnabled) && Boolean(ytdlpPath),
  });
}

function makeProgressHandler(
  e: IpcMainInvokeEvent,
  packId: string,
  url: string,
  abort: AbortController,
  progressStartedAt: number
) {
  let lastDownloaded = 0;
  let lastSpeedAt = progressStartedAt;
  let lastSpeedBytes = 0;
  let speedBps: number | null = null;

  return (info: {
    current: number;
    total: number;
    percent?: number;
    downloaded?: number;
    totalBytes?: number | null;
    phase?: string;
    title?: string;
    error?: string;
    result?: { title?: string };
  }) => {
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
    if (typeof info.downloaded === "number" && info.downloaded > lastSpeedBytes) {
      const now = Date.now();
      const dt = (now - lastSpeedAt) / 1000;
      if (dt >= 0.35) {
        speedBps = (info.downloaded - lastSpeedBytes) / dt;
        lastSpeedAt = now;
        lastSpeedBytes = info.downloaded;
      }
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
      speedBps,
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
  };
}

/** Active download runs — Tasks Stop / pause / cancel. */

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
    speedBps?: number | null;
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
    height: r.height,
    format: r.format,
    youtubeQuality: r.youtubeQuality,
    createdAt: now + i,
  }));
}

function maxHeightFromResults(results: ProcessResult[]): number | undefined {
  let max: number | undefined;
  for (const r of results) {
    if (typeof r.height === "number" && r.height > 0) {
      max = max == null ? r.height : Math.max(max, r.height);
    }
  }
  return max;
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
    packFolders?: boolean;
    naming?: NamingTemplates;
  }
) {
  const store = getStore();
  const { url, preset, outDir } = payload;
  const enhance = payload.enhance ?? store.get("enhance");
  const packFolders = payload.packFolders ?? store.get("packFolders") ?? true;
  const naming = {
    ...DEFAULT_NAMING_TEMPLATES,
    ...store.get("naming"),
    ...payload.naming,
  };
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

  // Provider extension overrides (engine / format / extractor / plugins) + enable gate
  let providerCfg: CustomProviderConfig | undefined;
  try {
    const hit = resolveProviderForUrl(url);
    if (!hit) {
      throw new Error("No provider matches this URL");
    }
    providerCfg = hit.config;
  } catch (err) {
    if (err instanceof ProviderDisabledError) throw err;
    if (err instanceof Error && err.message === "No provider matches this URL") throw err;
    providerCfg = undefined;
  }

  const format =
    payload.format ?? (providerCfg?.format as FormatPreset | undefined) ?? store.get("format");
  const extractorUrl = providerCfg?.extractorUrl?.trim() || store.get("extractorUrl") || undefined;
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
    format,
    youtubeQuality: youtube.quality,
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
  acquireRunSlot(true);

  const core = ensureMediaCore();
  await core.init();

  let mcJobId: string | null = null;

  try {
    await configureDownloadTools(core, store);

    const progressStartedAt = Date.now();
    const onProgress = makeProgressHandler(e, packId, url, abort, progressStartedAt);

    const mcJob = await core.jobs.create({
      url,
      outputDir: outDir,
      packId,
    });
    mcJobId = mcJob.id;
    registerActiveRun(mcJob.id, packId, abort);
    core.jobs.attachAbort(mcJob.id, abort);
    await core.jobs.updateStatus(mcJob.id, "analyzing");

    upsertPack({ ...runningPack, jobId: mcJob.id, updatedAt: Date.now() });

    const { job, result: res } = await core.runExistingJob(mcJob.id, {
      url,
      preset,
      outDir,
      enhance,
      features,
      format,
      youtube,
      pinterest,
      extractorUrl,
      packFolders,
      naming,
      delayMs: store.get("delayMs"),
      itemConcurrency: 3,
      fragmentConcurrency: 4,
      signal: abort.signal,
      packId,
      onProgress,
    });

    const abortReason = core.jobs.lastAbortReason(mcJob.id);
    if (abort.signal.aborted || job.status === "paused" || job.status === "cancelled") {
      const paused = job.status === "paused" || abortReason === "pause";
      const pack: DownloadPack = {
        ...runningPack,
        jobId: job.id,
        title: job.title,
        provider: job.provider as DownloadPack["provider"],
        status: "partial",
        errorCount: 0,
        updatedAt: Date.now(),
      };
      upsertPack(pack);
      emitProgress(e, {
        packId,
        url,
        current: 0,
        total: 1,
        status: "partial",
        title: job.title,
        message: paused ? "Paused" : "Cancelled",
      });
      return {
        kind: "pin" as const,
        provider: job.provider as DownloadPack["provider"],
        packId,
        pack,
        jobId: job.id,
        job,
        results: res.results,
        errors: [{ url, error: paused ? "Paused" : "Cancelled" }],
      };
    }

    const items = toHistory(url, preset, packId, res.results);
    pushHistory(items);

    const status: PackStatus =
      res.errors.length === 0 ? "done" : res.results.length === 0 ? "failed" : "partial";

    const skippedCount = res.results.filter((r) => r.skipped).length;
    const savedCount = res.results.length - skippedCount;

    const pack: DownloadPack = {
      id: packId,
      url,
      jobId: job.id,
      title: res.results[0]?.title ?? items[0]?.title ?? job.title,
      provider: (res.provider ?? job.provider) as DownloadPack["provider"],
      status,
      preset,
      itemIds: items.map((i) => i.id),
      errorCount: res.errors.length,
      format: runningPack.format ?? res.results[0]?.format,
      youtubeQuality: runningPack.youtubeQuality ?? res.results[0]?.youtubeQuality,
      height: maxHeightFromResults(res.results) ?? runningPack.height,
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
          ? skippedCount > 0
            ? `Done — ${savedCount} saved, ${skippedCount} skipped (already on disk)`
            : "Done"
          : status === "partial"
            ? skippedCount > 0
              ? `Saved ${savedCount}, ${skippedCount} skipped, ${res.errors.length} failed`
              : `Saved ${res.results.length}, ${res.errors.length} failed`
            : (res.errors[0]?.error ?? "Failed"),
    });

    void notifyRemoteDownloadComplete({
      url,
      status,
      title: pack.title,
      outPaths: res.results.map((r) => r.outPath).filter(Boolean),
      zipPath: res.zipPath,
    }).catch(() => undefined);

    return {
      kind: res.kind === "batch" ? ("board" as const) : ("pin" as const),
      provider: res.provider,
      packId,
      pack,
      jobId: job.id,
      job,
      results: res.results,
      errors: res.errors,
    };
  } catch (err) {
    const aborted =
      abort.signal.aborted ||
      (err instanceof Error &&
        (err.name === "AbortError" || /aborted|stopped|paused|cancelled/i.test(err.message)));
    const message = aborted ? "Stopped" : err instanceof Error ? err.message : String(err);
    const pack: DownloadPack = {
      ...runningPack,
      jobId: mcJobId ?? undefined,
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
        jobId: mcJobId ?? undefined,
        results: [],
        errors: [{ url, error: "Stopped" }],
      };
    }
    void notifyRemoteDownloadComplete({
      url,
      status: "failed",
      outPaths: [],
    }).catch(() => undefined);
    throw err;
  } finally {
    if (mcJobId) {
      ensureMediaCore().jobs.detachAbort(mcJobId);
      unregisterActiveRun(mcJobId);
    }
  }
}

function progressWebContents(): Electron.WebContents {
  const win = BrowserWindow.getAllWindows().find((w) => !isUninstallWindow(w));
  return win?.webContents ?? ({ send: () => undefined } as unknown as Electron.WebContents);
}

/** Headless download entry for remote bots / local API (no renderer invoke). */
export async function runProcessForRemote(payload: {
  url: string;
  format?: FormatPreset;
  youtube?: Partial<YoutubeDownloadOptions>;
}) {
  const store = getStore();
  const outDir = store.get("outDir")?.trim();
  if (!outDir) throw new Error("Download folder is not set");
  const fakeEvent = { sender: progressWebContents() } as IpcMainInvokeEvent;
  const youtube = {
    ...DEFAULT_YOUTUBE_OPTIONS,
    ...store.get("youtube"),
    ...payload.youtube,
  };
  return runProcess(fakeEvent, {
    url: payload.url,
    preset: store.get("preset"),
    outDir,
    format: payload.format,
    youtube,
  });
}

async function runProcessResume(e: IpcMainInvokeEvent, jobId: string) {
  const core = ensureMediaCore();
  await core.init();
  const job = await core.jobs.get(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const store = getStore();
  const packId = job.packId;
  if (!packId) throw new Error("Job has no linked download pack");

  const packs = store.get("packs");
  const existingPack = packs.find((p) => p.id === packId);
  const url = job.url;
  const preset = existingPack?.preset ?? store.get("preset");
  const outDir = job.outputDir ?? store.get("outDir");
  const enhance = store.get("enhance");
  const packFolders = store.get("packFolders") ?? true;
  const naming = { ...DEFAULT_NAMING_TEMPLATES, ...store.get("naming") };
  const features = { ...DEFAULT_ENHANCE_FEATURES, ...store.get("enhanceFeatures") };
  const youtube = { ...DEFAULT_YOUTUBE_OPTIONS, ...store.get("youtube") };
  const pinterest = { ...DEFAULT_PINTEREST_OPTIONS, ...store.get("pinterest") };
  configurePinterestCookies(pinterest.cookies);

  let providerCfg: CustomProviderConfig | undefined;
  try {
    providerCfg = resolveProviderForUrl(url)?.config;
  } catch {
    providerCfg = undefined;
  }
  const format = (providerCfg?.format as FormatPreset | undefined) ?? store.get("format");
  const extractorUrl = providerCfg?.extractorUrl?.trim() || store.get("extractorUrl") || undefined;

  const startedAt = existingPack?.createdAt ?? Date.now();
  const runningPack: DownloadPack = {
    id: packId,
    url,
    status: "running",
    preset,
    itemIds: existingPack?.itemIds ?? [],
    errorCount: existingPack?.errorCount ?? 0,
    jobId,
    format: existingPack?.format ?? format,
    youtubeQuality: existingPack?.youtubeQuality ?? youtube.quality,
    height: existingPack?.height,
    createdAt: startedAt,
    updatedAt: Date.now(),
    title: existingPack?.title ?? job.title,
    provider: (existingPack?.provider ?? job.provider) as DownloadPack["provider"],
  };
  upsertPack(runningPack);

  emitProgress(e, {
    packId,
    url,
    current: 0,
    total: 1,
    status: "running",
    percent: 0,
    phase: "start",
    message: "Resuming…",
  });

  const abort = new AbortController();
  acquireRunSlot(false);

  try {
    await configureDownloadTools(core, store);
    await core.jobs.resume(jobId);

    const progressStartedAt = Date.now();
    const onProgress = makeProgressHandler(e, packId, url, abort, progressStartedAt);

    registerActiveRun(jobId, packId, abort);
    core.jobs.attachAbort(jobId, abort);

    const { job: finishedJob, result: res } = await core.runExistingJob(jobId, {
      url,
      preset,
      outDir,
      enhance,
      features,
      format,
      youtube,
      pinterest,
      extractorUrl,
      packFolders,
      naming,
      delayMs: store.get("delayMs"),
      itemConcurrency: 3,
      fragmentConcurrency: 4,
      signal: abort.signal,
      packId,
      onProgress,
    });

    const abortReason = core.jobs.lastAbortReason(jobId);
    if (
      abort.signal.aborted ||
      finishedJob.status === "paused" ||
      finishedJob.status === "cancelled"
    ) {
      const paused = finishedJob.status === "paused" || abortReason === "pause";
      const pack: DownloadPack = {
        ...runningPack,
        jobId,
        title: finishedJob.title,
        provider: finishedJob.provider as DownloadPack["provider"],
        status: "partial",
        errorCount: 0,
        updatedAt: Date.now(),
      };
      upsertPack(pack);
      emitProgress(e, {
        packId,
        url,
        current: 0,
        total: 1,
        status: "partial",
        title: finishedJob.title,
        message: paused ? "Paused" : "Cancelled",
      });
      return {
        kind: "pin" as const,
        provider: finishedJob.provider as DownloadPack["provider"],
        packId,
        pack,
        jobId,
        job: finishedJob,
        results: res.results,
        errors: [{ url, error: paused ? "Paused" : "Cancelled" }],
      };
    }

    const items = toHistory(url, preset, packId, res.results);
    pushHistory(items);

    const status: PackStatus =
      res.errors.length === 0 ? "done" : res.results.length === 0 ? "failed" : "partial";
    const skippedCount = res.results.filter((r) => r.skipped).length;
    const savedCount = res.results.length - skippedCount;

    const pack: DownloadPack = {
      ...runningPack,
      jobId,
      title: res.results[0]?.title ?? items[0]?.title ?? finishedJob.title,
      provider: (res.provider ?? finishedJob.provider) as DownloadPack["provider"],
      status,
      itemIds: [...new Set([...(existingPack?.itemIds ?? []), ...items.map((i) => i.id)])],
      errorCount: res.errors.length,
      format: existingPack?.format ?? runningPack.format ?? res.results[0]?.format,
      youtubeQuality:
        existingPack?.youtubeQuality ??
        runningPack.youtubeQuality ??
        res.results[0]?.youtubeQuality,
      height: maxHeightFromResults(res.results) ?? existingPack?.height ?? runningPack.height,
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
          ? skippedCount > 0
            ? `Done — ${savedCount} saved, ${skippedCount} skipped (already on disk)`
            : "Done"
          : status === "partial"
            ? skippedCount > 0
              ? `Saved ${savedCount}, ${skippedCount} skipped, ${res.errors.length} failed`
              : `Saved ${res.results.length}, ${res.errors.length} failed`
            : (res.errors[0]?.error ?? "Failed"),
    });

    return {
      kind: res.kind === "batch" ? ("board" as const) : ("pin" as const),
      provider: res.provider,
      packId,
      pack,
      jobId,
      job: finishedJob,
      results: res.results,
      errors: res.errors,
    };
  } catch (err) {
    const aborted =
      abort.signal.aborted ||
      (err instanceof Error &&
        (err.name === "AbortError" || /aborted|stopped|paused|cancelled/i.test(err.message)));
    const message = aborted ? "Stopped" : err instanceof Error ? err.message : String(err);
    const pack: DownloadPack = {
      ...runningPack,
      jobId,
      status: aborted ? "partial" : "failed",
      errorCount: aborted ? 0 : 1,
      updatedAt: Date.now(),
    };
    upsertPack(pack);
    emitProgress(e, { packId, url, current: 0, total: 1, status: pack.status, message });
    if (aborted) {
      return {
        kind: "pin" as const,
        provider: undefined,
        packId,
        pack,
        jobId,
        results: [],
        errors: [{ url, error: "Stopped" }],
      };
    }
    throw err;
  } finally {
    ensureMediaCore().jobs.detachAbort(jobId);
    unregisterActiveRun(jobId);
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
  ipcMain.handle("media:resume", async (e, payload: { jobId: string }) =>
    runProcessResume(e, payload.jobId)
  );
  ipcMain.handle("pin:process", async (e, payload) => runProcess(e, payload));
  ipcMain.handle("media:cancel", async () => {
    const core = ensureMediaCore();
    if (activeRuns.size === 0) return { ok: false, message: "No active download" };
    for (const run of activeRuns.values()) {
      await core.jobs.cancel(run.jobId, { deleteFiles: false });
      run.abort.abort();
    }
    return { ok: true, message: "Cancelling…" };
  });

  ipcMain.handle("jobs:list", async (_e, filter?: { status?: JobStatus[]; limit?: number }) => {
    const core = ensureMediaCore();
    return core.listJobs(filter);
  });
  ipcMain.handle("jobs:get", async (_e, id: string) => {
    const core = ensureMediaCore();
    return core.jobs.get(id);
  });
  ipcMain.handle("jobs:pause", async (_e, id?: string) => {
    const core = ensureMediaCore();
    const targets = id ? [id] : [...activeRuns.values()].map((r) => r.jobId);
    if (targets.length === 0) {
      return { ok: false, message: "No active job", job: null as DownloadJob | null };
    }
    let lastJob: DownloadJob | null = null;
    for (const jobId of targets) {
      lastJob = await core.jobs.pause(jobId);
      const run = activeRuns.get(jobId);
      if (run) {
        const store = getStore();
        const pack = store.get("packs").find((p) => p.id === run.packId);
        if (pack) {
          upsertPack({ ...pack, status: "partial", jobId, updatedAt: Date.now() });
        }
      }
    }
    return { ok: true, message: "Paused", job: lastJob };
  });
  ipcMain.handle("jobs:resume", async (e, id: string) => runProcessResume(e, id));
  ipcMain.handle(
    "jobs:cancel",
    async (_e, payload: { id?: string; deleteFiles?: boolean } | string) => {
      const core = ensureMediaCore();
      const id =
        typeof payload === "string" ? payload : payload?.id || [...activeRuns.values()][0]?.jobId;
      const deleteFiles =
        typeof payload === "object" && payload ? Boolean(payload.deleteFiles) : false;
      if (!id) return { ok: false, message: "No job id", job: null as DownloadJob | null };
      const job = await core.jobs.cancel(id, { deleteFiles } satisfies CancelJobOptions);
      return { ok: true, job };
    }
  );
  ipcMain.handle("jobs:recover", async () => {
    const core = ensureMediaCore();
    const recovered = await core.recover();
    syncRecoveredJobsToPacks(recovered);
    return recovered;
  });
  ipcMain.handle("jobs:listUnfinished", async () => {
    const core = ensureMediaCore();
    return core.jobs.listUnfinished();
  });

  ipcMain.handle("media:detect", async (_e, url: string) => {
    try {
      const hit = resolveProviderForUrl(url);
      if (!hit) return null;
      return {
        id: hit.id,
        label: hit.label,
        live: hit.live,
        formats: hit.formats,
        modes: hit.modes,
      };
    } catch (err) {
      if (err instanceof ProviderDisabledError) {
        return {
          id: err.providerId,
          label: err.providerLabel,
          live: false,
          formats: [],
          modes: [],
          disabled: true,
          message: err.message,
        };
      }
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
        try {
          resolveProviderForUrl(url);
        } catch (err) {
          if (err instanceof ProviderDisabledError) {
            return {
              sourceUrl: typeof url === "string" ? url : "",
              provider: { id: err.providerId, label: err.providerLabel, live: false },
              mode: "single",
              modeSupported: false,
              formats: [],
              supportedModes: [],
              items: [],
              itemCount: 0,
              message: err.message,
            };
          }
        }
        const youtube = {
          ...DEFAULT_YOUTUBE_OPTIONS,
          ...store.get("youtube"),
        };
        const pinterest = {
          ...DEFAULT_PINTEREST_OPTIONS,
          ...store.get("pinterest"),
        };
        configurePinterestCookies(pinterest.cookies);
        const system = store.get("system");
        const ytdlpPath = await resolveConfiguredYtdlp();
        configureYtdlp({
          path: ytdlpPath ?? system.ytdlpPath ?? undefined,
          enabled: Boolean(system.ytdlpEnabled) && Boolean(ytdlpPath),
        });
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
    }
  );

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

  ipcMain.handle("app:getInfo", () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged,
  }));

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
      packFolders: store.get("packFolders") ?? true,
      naming: { ...DEFAULT_NAMING_TEMPLATES, ...store.get("naming") },
      clipboardMonitor: store.get("clipboardMonitor") ?? false,
      clipboardMonitorBackground: store.get("clipboardMonitorBackground") ?? false,
      maxParallelDownloads: store.get("maxParallelDownloads") ?? 2,
      pendingQueue: store.get("pendingQueue") ?? [],
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
      providerPrefs: getProviderPrefs(),
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
        packFolders: boolean;
        naming: Partial<NamingTemplates>;
        clipboardMonitor: boolean;
        clipboardMonitorBackground: boolean;
        maxParallelDownloads: number;
        pendingQueue: PendingQueueJob[];
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
      if (partial.packFolders !== undefined) store.set("packFolders", partial.packFolders);
      if (partial.naming !== undefined) {
        store.set("naming", {
          ...DEFAULT_NAMING_TEMPLATES,
          ...store.get("naming"),
          ...partial.naming,
        });
      }
      if (partial.clipboardMonitor !== undefined)
        store.set("clipboardMonitor", partial.clipboardMonitor);
      if (partial.clipboardMonitorBackground !== undefined) {
        store.set("clipboardMonitorBackground", partial.clipboardMonitorBackground);
      }
      if (partial.maxParallelDownloads !== undefined) {
        store.set(
          "maxParallelDownloads",
          Math.max(1, Math.min(3, Math.floor(partial.maxParallelDownloads) || 1))
        );
      }
      if (partial.pendingQueue !== undefined) store.set("pendingQueue", partial.pendingQueue);
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
        if (next.ytdlpEnabled) {
          const check = await getYtdlpStatus();
          if (!check.available) {
            next.ytdlpEnabled = false;
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
        packFolders: store.get("packFolders") ?? true,
        naming: { ...DEFAULT_NAMING_TEMPLATES, ...store.get("naming") },
        clipboardMonitor: store.get("clipboardMonitor") ?? false,
        clipboardMonitorBackground: store.get("clipboardMonitorBackground") ?? false,
        maxParallelDownloads: store.get("maxParallelDownloads") ?? 2,
        pendingQueue: store.get("pendingQueue") ?? [],
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
      users: prev.users ?? [],
    };
    store.set("remote", next);
    await syncRemoteRuntime();
    return store.get("remote");
  });

  ipcMain.handle(
    "remote:upsertChannel",
    async (
      _e,
      channel: Partial<import("../common/remote/types").RemoteChannelConfig> & {
        id: string;
        botToken?: string;
      }
    ) => {
      const store = getStore();
      const remote = store.get("remote");
      const idx = remote.channels.findIndex((c) => c.id === channel.id);
      const channels = [...remote.channels];
      if (idx >= 0) {
        const prev = channels[idx]!;
        const merged = { ...prev, ...channel } as (typeof channels)[number];
        const incomingToken = channel.botToken?.trim() ?? "";
        const prevToken = prev.botToken?.trim() ?? "";
        if (!incomingToken && prevToken) merged.botToken = prev.botToken;
        else if (incomingToken) merged.botToken = normalizeTelegramToken(incomingToken);
        if (channel.botOptions) {
          merged.botOptions = { ...prev.botOptions, ...channel.botOptions };
        } else if (prev.botOptions) {
          merged.botOptions = prev.botOptions;
        }
        channels[idx] = merged;
      } else {
        channels.push({
          ...(channel as (typeof channels)[number]),
          botToken: channel.botToken ? normalizeTelegramToken(channel.botToken) : channel.botToken,
        });
      }
      const next = { ...remote, channels };
      store.set("remote", next);
      await syncRemoteRuntime();
      return store.get("remote");
    }
  );

  ipcMain.handle("remote:getRuntimeStatus", async () => getRemoteRuntimeStatus());

  ipcMain.handle("remote:listUsers", async (_e, filter?: { channel?: string; status?: string }) =>
    listRemoteUsers(
      filter as { channel?: string; status?: "pending" | "approved" | "denied" } | undefined
    )
  );

  ipcMain.handle(
    "remote:setUserStatus",
    async (_e, payload: { id: string; status: "approved" | "denied" }) => {
      const user = setRemoteUserStatus(payload.id, payload.status);
      if (user?.channel === "telegram") {
        await notifyTelegramAccessDecision(user.externalId, payload.status).catch(() => undefined);
      }
      return listRemoteUsers();
    }
  );

  ipcMain.handle("remote:removeUser", async (_e, id: string) => {
    removeRemoteUser(id);
    return listRemoteUsers();
  });

  ipcMain.handle(
    "remote:testChannel",
    async (
      _e,
      payload: { id: string; botToken?: string; webhookUrl?: string }
    ): Promise<{ ok: boolean; message: string }> => {
      const id = String(payload.id);
      let token = normalizeTelegramToken(payload.botToken ?? "");
      const webhookUrl = (payload.webhookUrl ?? "").trim();

      try {
        if (id === "telegram" || id.startsWith("telegram")) {
          if (!token) {
            const saved = getStore()
              .get("remote")
              .channels.find((c) => c.id === "telegram" || String(c.id).startsWith("telegram"));
            token = normalizeTelegramToken(saved?.botToken ?? "");
          }
          const result = await testTelegramToken(token);
          if (result.ok) await syncRemoteRuntime();
          return result;
        }

        if (id === "discord") {
          if (!token && !webhookUrl) {
            return { ok: false, message: "Enter a bot token or webhook URL." };
          }
          if (webhookUrl) {
            if (
              !/^https:\/\/(discord(?:app)?\.com|discord\.com)\/api\/webhooks\//i.test(webhookUrl)
            ) {
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

  ipcMain.handle("providers:listInstalled", async () => buildInstalledViews(listProviders()));

  ipcMain.handle("providers:registryList", async () => buildRegistryList());

  ipcMain.handle("providers:setEnabled", async (_e, payload: { id: string; enabled: boolean }) => {
    setProviderEnabled(payload.id, payload.enabled);
    return {
      providers: getStore().get("customProviders") ?? [],
      providerPrefs: getProviderPrefs(),
      installed: buildInstalledViews(listProviders()),
    };
  });

  ipcMain.handle("providers:installFromRegistry", async (_e, id: string) => {
    const item = PROVIDER_REGISTRY.find((r) => r.id === id);
    if (!item) throw new Error(`Registry provider not found: ${id}`);
    const store = getStore();
    const list = [...(store.get("customProviders") ?? [])];
    const now = Date.now();
    const next: CustomProviderConfig = {
      id: item.id,
      label: item.label,
      enabled: false,
      hosts: item.hosts,
      notes: item.description,
      sourceUrl: `registry://${item.id}`,
      engine: item.engine ?? "http-meta",
      origin: "registry",
      capabilities: item.capabilities,
      installedVersion: item.version,
      version: item.version,
      checksum: item.checksum,
      formatPlugins: [],
      createdAt: now,
      updatedAt: now,
    };
    const idx = list.findIndex((p) => p.id === next.id);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx]!,
        ...next,
        createdAt: list[idx]!.createdAt,
        enabled: list[idx]!.enabled,
        sourcePath: list[idx]!.sourcePath,
        manifestPath: list[idx]!.manifestPath,
        manifest: list[idx]!.manifest,
      };
    } else list.push(next);
    store.set("customProviders", list);
    return {
      provider: list.find((p) => p.id === id)!,
      providers: list,
      registry: buildRegistryList(),
    };
  });

  ipcMain.handle("providers:uninstall", async (_e, id: string) => {
    const liveBuiltin = listProviders().find((p) => p.id === id && p.status === "live");
    if (liveBuiltin) {
      throw new Error("Built-in providers cannot be uninstalled. Disable them instead.");
    }
    const store = getStore();
    const list = (store.get("customProviders") ?? []).filter((p) => p.id !== id);
    store.set("customProviders", list);
    uninstallProviderFiles(id);
    return {
      providers: list,
      registry: buildRegistryList(),
      installed: buildInstalledViews(listProviders()),
    };
  });

  ipcMain.handle("providers:upsertCustom", async (_e, provider: CustomProviderConfig) => {
    const store = getStore();
    const list = [...(store.get("customProviders") ?? [])];
    const idx = list.findIndex((p) => p.id === provider.id);
    const next = { ...provider, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = { ...list[idx]!, ...next };
    else list.push(next);
    store.set("customProviders", list);
    return list;
  });

  ipcMain.handle("providers:removeCustom", async (_e, id: string) => {
    const store = getStore();
    const list = (store.get("customProviders") ?? []).filter((p) => p.id !== id);
    store.set("customProviders", list);
    uninstallProviderFiles(id);
    return list;
  });

  ipcMain.handle("providers:installFromSource", async (_e, sourcePath: string) => {
    const installed = await installProviderFromSource(sourcePath);
    const store = getStore();
    const list = [...(store.get("customProviders") ?? [])];
    const now = Date.now();
    const next: CustomProviderConfig = {
      id: installed.manifest.id,
      label: installed.manifest.name,
      enabled: true,
      hosts: (installed.manifest.hosts ?? []).join(", "),
      sourcePath: installed.installDir,
      manifestPath: installed.manifestPath,
      manifest: installed.manifest,
      engine: installed.manifest.engine ?? "script",
      format: installed.manifest.formats?.[0],
      notes: installed.manifest.description,
      version: installed.manifest.version,
      installedVersion: installed.manifest.version,
      origin: "local",
      capabilities: installed.manifest.capabilities,
      checksum: installed.checksum,
      formatPlugins: [],
      createdAt: now,
      updatedAt: now,
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
    // Always destroy the dedicated uninstall window (ignore close-to-tray).
    if (isUninstallWindow(win)) {
      win.destroy();
      return;
    }
    win.close();
  });

  ipcMain.handle("window:isMaximized", (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle("window:setInstallerMode", (e, active: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return { ok: false };
    if (active) enterInstallerWindow(win);
    else exitInstallerWindow(win);
    return { ok: true };
  });

  ipcMain.handle("app:uninstall", async (_e, opts?: { clearData?: boolean }) => {
    return uninstallApp({ clearData: Boolean(opts?.clearData) });
  });

  ipcMain.handle("tools:ffmpegStatus", async () => getFfmpegStatus());

  ipcMain.handle("tools:ffmpegInstall", async (e) => {
    const send = (payload: { phase: string; percent: number; message: string }) => {
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

  ipcMain.handle("tools:ytdlpStatus", async () => getYtdlpStatus());

  ipcMain.handle("tools:ytdlpInstall", async (e) => {
    const send = (payload: { phase: string; percent: number; message: string }) => {
      e.sender.send("tools:ytdlpProgress", payload);
    };
    return installYtdlp((ev) => send(ev));
  });

  ipcMain.handle("tools:ytdlpPick", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters:
        process.platform === "win32"
          ? [{ name: "yt-dlp", extensions: ["exe"] }]
          : [{ name: "yt-dlp", extensions: ["*"] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const bin = res.filePaths[0];
    const store = getStore();
    const system = store.get("system");
    store.set("system", { ...system, ytdlpPath: bin, ytdlpEnabled: true });
    return getYtdlpStatus();
  });

  ipcMain.handle("tools:playwrightStatus", async () => getPlaywrightStatus());

  ipcMain.handle("tools:playwrightInstall", async (e) => {
    const send = (payload: { phase: string; percent: number; message: string }) => {
      e.sender.send("tools:playwrightProgress", payload);
    };
    return installPlaywrightChromium((ev) => send(ev));
  });

  ipcMain.handle("tools:environmentSetupStatus", async () => getEnvironmentSetupStatus());

  ipcMain.handle("tools:environmentSetupStart", async (e) => {
    const send = (payload: {
      step: string;
      stepIndex: number;
      stepCount: number;
      phase: string;
      percent: number;
      message: string;
      toolAvailable?: boolean;
    }) => {
      e.sender.send("tools:environmentSetupProgress", payload);
    };
    return runEnvironmentSetup((ev) => send(ev));
  });

  ipcMain.handle("tools:environmentSetupComplete", async () => completeEnvironmentSetup());

  ipcMain.handle("update:getStatus", () => getUpdateStatus());
  ipcMain.handle("update:check", async (_e, req?: { includePrerelease?: boolean }) =>
    checkForUpdates({ includePrerelease: req?.includePrerelease })
  );
  ipcMain.handle("update:download", async () => downloadUpdate());
  ipcMain.handle("update:quitAndInstall", () => quitAndInstall());

  registerUninstallWindowIpc();
  void syncRemoteRuntime().catch(() => undefined);
}

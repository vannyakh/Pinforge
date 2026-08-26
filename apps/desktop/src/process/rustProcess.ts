/**
 * Download execution via pinforge-server (Rust). Node MediaCore removed.
 */

import type { IpcMainInvokeEvent } from "electron";
import { configurePinterestCookies } from "@pinforge/core/providers";
import {
  DEFAULT_YOUTUBE_OPTIONS,
  DEFAULT_PINTEREST_OPTIONS,
  type PresetName,
  type FormatPreset,
  type ProcessResult,
  type EnhanceFeatures,
  type YoutubeDownloadOptions,
  type PinterestOptions,
  type NamingTemplates,
} from "@pinforge/core/types";
import { ProviderDisabledError, resolveProviderForUrl } from "./providerResolve";
import { getStore, type DownloadPack, type PackStatus, type HistoryItem } from "./store";
import type { CustomProviderConfig } from "./store";
import type { DownloadJob } from "./jobTypes";
import { pinforgeServer, requireServer, serverRequest } from "./pinforgeServer";
import { configureFfmpeg } from "@pinforge/core/tools";
import { configureYtdlp } from "@pinforge/core/providers";
import { resolveConfiguredFfmpeg } from "./ffmpegInstall";
import { resolveConfiguredYtdlp } from "./ytdlpInstall";
import { notifyRemoteDownloadComplete } from "./services/remoteRuntime";

type ActiveRun = { abort: AbortController; jobId: string; packId: string };

export type ProcessEmit = (
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
) => void;

export type RunProcessDeps = {
  activeRuns: Map<string, ActiveRun>;
  acquireRunSlot: (abortPrevious: boolean) => void;
  registerActiveRun: (jobId: string, packId: string, abort: AbortController) => void;
  unregisterActiveRun: (jobId: string) => void;
  upsertPack: (pack: DownloadPack) => void;
  pushHistory: (items: HistoryItem[]) => void;
  toHistory: (
    url: string,
    preset: PresetName,
    packId: string,
    results: ProcessResult[]
  ) => HistoryItem[];
  emitProgress: ProcessEmit;
};

async function syncToolsToServer(): Promise<void> {
  const store = getStore();
  const [ffPath, ytdlpPath] = await Promise.all([
    resolveConfiguredFfmpeg(),
    resolveConfiguredYtdlp(),
  ]);
  const system = store.get("system");
  configureFfmpeg({
    path: ffPath ?? system.ffmpegPath ?? undefined,
    enabled: Boolean(system.ffmpegEnabled) && Boolean(ffPath),
  });
  configureYtdlp({
    path: ytdlpPath ?? system.ytdlpPath ?? undefined,
    enabled: Boolean(system.ytdlpEnabled) && Boolean(ytdlpPath),
  });
  await serverRequest("tools.setPaths", {
    ytdlp: ytdlpPath ?? system.ytdlpPath ?? undefined,
    ffmpeg: ffPath ?? system.ffmpegPath ?? undefined,
  }).catch(() => undefined);
  const outDir = store.get("outDir");
  if (outDir) {
    await serverRequest("config.setOutDir", { outDir }).catch(() => undefined);
  }
}

export async function runProcessViaRust(
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
  },
  deps: RunProcessDeps
) {
  await requireServer();
  await syncToolsToServer();

  const store = getStore();
  const { url, preset, outDir } = payload;
  const enhance = payload.enhance ?? store.get("enhance");
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

  let providerCfg: CustomProviderConfig | undefined;
  try {
    const hit = resolveProviderForUrl(url);
    if (!hit) throw new Error("No provider matches this URL");
    providerCfg = hit.config;
  } catch (err) {
    if (err instanceof ProviderDisabledError) throw err;
    if (err instanceof Error && err.message === "No provider matches this URL") throw err;
    providerCfg = undefined;
  }

  const format =
    payload.format ?? (providerCfg?.format as FormatPreset | undefined) ?? store.get("format");

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
  deps.upsertPack(runningPack);
  deps.emitProgress(e, {
    packId,
    url,
    current: 0,
    total: 1,
    status: "running",
    percent: 0,
    phase: "start",
    message: "Starting (pinforge-server)…",
  });

  const abort = new AbortController();
  deps.acquireRunSlot(true);

  let mcJobId: string | null = null;
  const client = pinforgeServer();
  const onJobEvent = (jobPayload: unknown) => {
    const job = jobPayload as DownloadJob;
    if (!job?.id || (mcJobId && job.id !== mcJobId)) return;
    if (typeof job.progress?.percent === "number") {
      deps.emitProgress(e, {
        packId,
        url,
        current: 0,
        total: 1,
        status: "running",
        percent: job.progress.percent,
        downloaded: job.progress.downloadedBytes,
        totalBytes: job.progress.totalBytes ?? null,
        title: job.title,
        phase: job.status,
        message: job.status,
      });
    }
  };
  const onDlProgress = (pPayload: unknown) => {
    const p = pPayload as {
      jobId?: string;
      percent?: number;
      downloadedBytes?: number;
      totalBytes?: number;
    };
    if (mcJobId && p.jobId && p.jobId !== mcJobId) return;
    deps.emitProgress(e, {
      packId,
      url,
      current: 0,
      total: 1,
      status: "running",
      percent: p.percent,
      downloaded: p.downloadedBytes,
      totalBytes: p.totalBytes ?? null,
      phase: "download",
      message: "Downloading…",
    });
  };
  client.on("job.updated", onJobEvent);
  client.on("download.progress", onDlProgress);

  try {
    const result = await serverRequest<{
      ok: boolean;
      job: DownloadJob;
      outPath: string;
      via?: string;
    }>("media.process", { url, outDir, packId });

    const job = result.job;
    mcJobId = job.id;
    deps.registerActiveRun(job.id, packId, abort);

    if (abort.signal.aborted || job.status === "paused" || job.status === "cancelled") {
      const pack: DownloadPack = {
        ...runningPack,
        jobId: job.id,
        title: job.title,
        provider: job.provider as DownloadPack["provider"],
        status: "partial",
        errorCount: 0,
        updatedAt: Date.now(),
      };
      deps.upsertPack(pack);
      deps.emitProgress(e, {
        packId,
        url,
        current: 0,
        total: 1,
        status: "partial",
        title: job.title,
        message: job.status === "paused" ? "Paused" : "Cancelled",
      });
      return {
        kind: "pin" as const,
        provider: job.provider as DownloadPack["provider"],
        packId,
        pack,
        jobId: job.id,
        job,
        results: [] as ProcessResult[],
        errors: [{ url, error: job.status === "paused" ? "Paused" : "Cancelled" }],
      };
    }

    if (job.status === "failed") {
      throw new Error(job.error || "Download failed");
    }

    const outPath = result.outPath || job.files?.final || "";
    const processResult: ProcessResult = {
      outPath,
      sourceUrl: url,
      title: job.title,
      provider: job.provider as ProcessResult["provider"],
      kind: "video",
    };
    const items = deps.toHistory(url, preset, packId, [processResult]);
    deps.pushHistory(items);

    const status: PackStatus = "done";
    const pack: DownloadPack = {
      id: packId,
      url,
      jobId: job.id,
      title: job.title ?? items[0]?.title,
      provider: job.provider as DownloadPack["provider"],
      status,
      preset,
      itemIds: items.map((i) => i.id),
      errorCount: 0,
      format,
      youtubeQuality: youtube.quality,
      createdAt: startedAt,
      updatedAt: Date.now(),
    };
    deps.upsertPack(pack);
    deps.emitProgress(e, {
      packId,
      url,
      current: 1,
      total: 1,
      status: "done",
      title: pack.title,
      message: `Done${result.via ? ` (${result.via})` : ""}`,
    });

    void notifyRemoteDownloadComplete({
      url,
      status: "done",
      title: pack.title,
      outPaths: outPath ? [outPath] : [],
    }).catch(() => undefined);

    return {
      kind: "pin" as const,
      provider: job.provider,
      packId,
      pack,
      jobId: job.id,
      job,
      results: [processResult],
      errors: [] as { url: string; error: string }[],
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
    deps.upsertPack(pack);
    deps.emitProgress(e, {
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
        results: [] as ProcessResult[],
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
    client.off("job.updated", onJobEvent);
    client.off("download.progress", onDlProgress);
    if (mcJobId) deps.unregisterActiveRun(mcJobId);
  }
}

export async function cancelJobViaRust(jobId: string): Promise<DownloadJob> {
  await requireServer();
  return serverRequest<DownloadJob>("jobs.cancel", { id: jobId });
}

export async function pauseJobViaRust(jobId: string): Promise<DownloadJob> {
  await requireServer();
  return serverRequest<DownloadJob>("jobs.pause", { id: jobId });
}

export async function resumeJobViaRust(jobId: string): Promise<DownloadJob> {
  await requireServer();
  return serverRequest<DownloadJob>("jobs.resume", { id: jobId });
}

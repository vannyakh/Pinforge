import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Message } from "@arco-design/web-react";
import {
  api,
  type AppSettings,
  type HistoryItem,
  type DownloadPack,
  type FormatPreset,
  type PresetName,
  type EnhanceFeatures,
  type YoutubeDownloadOptions,
  type SettingsPartial,
  type MediaProgressEvent,
  type PackStatus,
  type ProcessResponse,
} from "@renderer/api";

interface ProcessOpts {
  enhance?: boolean;
  format?: FormatPreset;
  preset?: PresetName;
  outDir?: string;
  features?: Partial<EnhanceFeatures>;
  youtube?: Partial<YoutubeDownloadOptions>;
  /**
   * When false, skip desktop Notification / Message for this call
   * (used for batch downloads that notify once at the end). Default true.
   */
  notify?: boolean;
}

export interface DownloadTask {
  packId: string;
  url: string;
  current: number;
  total: number;
  status: PackStatus;
  title?: string;
  message?: string;
  updatedAt: number;
  percent?: number;
  downloaded?: number;
  totalBytes?: number | null;
  phase?: string;
  etaSec?: number | null;
  speedBps?: number | null;
}

interface AppContextValue {
  settings: AppSettings | null;
  history: HistoryItem[];
  packs: DownloadPack[];
  tasks: DownloadTask[];
  busy: boolean;
  refresh: () => Promise<void>;
  processUrl: (url: string, opts?: ProcessOpts) => Promise<ProcessResponse | null>;
  resumeMedia: (jobId: string, opts?: ProcessOpts) => Promise<ProcessResponse | null>;
  cancelDownload: () => Promise<boolean>;
  pauseDownload: () => Promise<boolean>;
  updateSettings: (partial: SettingsPartial) => Promise<void>;
  clearHistory: () => Promise<void>;
  clearPacks: () => Promise<void>;
  removePacks: (ids: string[]) => Promise<void>;
  itemsForPack: (packId: string) => HistoryItem[];
  /** Tasks page registers to receive clipboard-grabbed URLs. */
  registerQueueSink: (fn: ((urls: string[]) => void) | null) => void;
  /** Append URLs to the persisted Tasks queue (deduped). Returns count added. */
  queueUrls: (urls: string[]) => Promise<number>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [packs, setPacks] = useState<DownloadPack[]>([]);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [busy, setBusy] = useState(false);
  const activeCountRef = useRef(0);
  const queueSinkRef = useRef<((urls: string[]) => void) | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);
  const packsRef = useRef<DownloadPack[]>([]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    packsRef.current = packs;
  }, [packs]);

  const trackDownloadStart = useCallback(() => {
    activeCountRef.current += 1;
    setBusy(true);
  }, []);

  const trackDownloadEnd = useCallback(() => {
    activeCountRef.current = Math.max(0, activeCountRef.current - 1);
    setBusy(activeCountRef.current > 0);
  }, []);

  const registerQueueSink = useCallback((fn: ((urls: string[]) => void) | null) => {
    queueSinkRef.current = fn;
  }, []);

  const refresh = useCallback(async () => {
    const s = await api.getSettings();
    setSettings(s);
    setHistory(s.history ?? []);
    setPacks(s.packs ?? []);
  }, []);

  useEffect(() => {
    refresh().catch((e) => Message.error(e instanceof Error ? e.message : String(e)));
  }, [refresh]);

  useEffect(() => {
    return api.onMediaProgress((ev: MediaProgressEvent) => {
      setTasks((prev) => {
        const next: DownloadTask = {
          packId: ev.packId,
          url: ev.url,
          current: ev.current,
          total: ev.total,
          status: ev.status,
          title: ev.title,
          message: ev.message,
          updatedAt: Date.now(),
          percent: ev.percent,
          downloaded: ev.downloaded,
          totalBytes: ev.totalBytes,
          phase: ev.phase,
          etaSec: ev.etaSec,
          speedBps: ev.speedBps,
        };
        const rest = prev.filter((t) => t.packId !== ev.packId);
        return [next, ...rest].slice(0, 30);
      });
    });
  }, []);

  const processUrl = useCallback(
    async (url: string, opts?: ProcessOpts): Promise<ProcessResponse | null> => {
      if (!settings) return null;
      const shouldNotify = opts?.notify !== false;
      trackDownloadStart();
      try {
        const res = await api.processMedia({
          url,
          preset: opts?.preset ?? settings.preset,
          outDir: opts?.outDir ?? settings.outDir,
          enhance: opts?.enhance ?? settings.enhance,
          format: opts?.format ?? settings.format,
          features: opts?.features ?? settings.enhanceFeatures,
          youtube: { ...settings.youtube, ...opts?.youtube },
          pinterest: settings.pinterest,
          packFolders: settings.packFolders !== false,
          naming: settings.naming ?? undefined,
        });
        const stopped = res.errors.some((e) => /stopped/i.test(e.error));
        if (
          shouldNotify &&
          !stopped &&
          settings.system?.notifications &&
          settings.system.notifyOnDownloadComplete &&
          typeof Notification !== "undefined"
        ) {
          try {
            const ok = res.results.length;
            new Notification("Pinforge", {
              body:
                res.kind === "board"
                  ? `Board done — ${ok} saved`
                  : `Download saved${res.provider ? ` (${res.provider})` : ""}`,
            });
          } catch {
            // Notification permission denied
          }
        }
        await refresh();
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (shouldNotify && !/abort|stopped/i.test(msg)) {
          Message.error(msg);
        }
        await refresh();
        return null;
      } finally {
        trackDownloadEnd();
      }
    },
    [settings, refresh, trackDownloadStart, trackDownloadEnd]
  );

  const resumeMedia = useCallback(
    async (jobId: string, opts?: ProcessOpts): Promise<ProcessResponse | null> => {
      if (!settings) return null;
      const shouldNotify = opts?.notify !== false;
      trackDownloadStart();
      try {
        const res = await api.resumeMedia(jobId);
        const stopped = res.errors.some((e) => /stopped|paused/i.test(e.error));
        if (
          shouldNotify &&
          !stopped &&
          settings.system?.notifications &&
          settings.system.notifyOnDownloadComplete &&
          typeof Notification !== "undefined"
        ) {
          try {
            new Notification("Pinforge", {
              body: res.kind === "board" ? "Board resumed — saved" : "Download resumed — saved",
            });
          } catch {
            /* denied */
          }
        }
        await refresh();
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (shouldNotify && !/abort|stopped/i.test(msg)) Message.error(msg);
        await refresh();
        return null;
      } finally {
        trackDownloadEnd();
      }
    },
    [settings, refresh, trackDownloadStart, trackDownloadEnd]
  );

  const cancelDownload = useCallback(async () => {
    const res = await api.cancelMedia();
    return res.ok;
  }, []);

  const pauseDownload = useCallback(async () => {
    const res = await api.pauseJob();
    return res.ok;
  }, []);

  const updateSettings = useCallback(async (partial: SettingsPartial) => {
    const next = await api.setSettings(partial);
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            ...next,
            system: next.system ?? prev.system,
            enhanceFeatures: next.enhanceFeatures
              ? { ...prev.enhanceFeatures, ...next.enhanceFeatures }
              : prev.enhanceFeatures,
            autoDownload: next.autoDownload ?? prev.autoDownload,
            packFolders: next.packFolders ?? prev.packFolders,
            naming: next.naming ? { ...(prev.naming ?? {}), ...next.naming } : prev.naming,
            clipboardMonitor: next.clipboardMonitor ?? prev.clipboardMonitor,
            clipboardMonitorBackground:
              next.clipboardMonitorBackground ?? prev.clipboardMonitorBackground,
            maxParallelDownloads: next.maxParallelDownloads ?? prev.maxParallelDownloads,
            pendingQueue: next.pendingQueue ?? prev.pendingQueue,
            youtube: next.youtube ? { ...prev.youtube, ...next.youtube } : prev.youtube,
            pinterest: next.pinterest ? { ...prev.pinterest, ...next.pinterest } : prev.pinterest,
          }
        : prev
    );
  }, []);

  const queueUrls = useCallback(
    async (urls: string[]) => {
      const s = settingsRef.current;
      if (!s?.outDir?.trim()) {
        Message.warning("Set a download folder first.");
        return 0;
      }
      const pending = s.pendingQueue ?? [];
      const packUrls = new Set(packsRef.current.map((p) => p.url));
      const existing = new Set([...pending.map((q) => q.url), ...packUrls]);
      const next = [...pending];
      let added = 0;
      for (const url of urls) {
        if (existing.has(url)) continue;
        existing.add(url);
        next.push({
          id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url,
          addedAt: Date.now(),
          opts: {
            enhance: s.enhance,
            format: s.format,
            preset: s.preset,
            outDir: s.outDir,
            youtube: {
              quality: s.youtube?.quality ?? "best",
              audioContainer: s.youtube?.audioContainer ?? "m4a",
              subtitles: s.youtube?.subtitles ?? "separate",
              saveVideo: s.youtube?.saveVideo !== false,
              saveAudio: s.youtube?.saveAudio !== false,
              saveThumbnail: s.youtube?.saveThumbnail !== false,
            },
          },
        });
        added += 1;
      }
      if (added > 0) await updateSettings({ pendingQueue: next });
      return added;
    },
    [updateSettings]
  );

  useEffect(() => {
    return api.onClipboardUrls(({ urls }) => {
      if (queueSinkRef.current) {
        queueSinkRef.current(urls);
        return;
      }
      void queueUrls(urls);
    });
  }, [queueUrls]);

  useEffect(() => {
    return api.onQueueUpdated(() => {
      void refresh();
    });
  }, [refresh]);

  const clearHistory = useCallback(async () => {
    await api.clearHistory();
    setHistory([]);
    setPacks([]);
    setTasks([]);
  }, []);

  const clearPacks = useCallback(async () => {
    await api.clearPacks();
    setPacks([]);
    setTasks([]);
  }, []);

  const removePacks = useCallback(async (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return;
    await api.removePacks(unique);
    const idSet = new Set(unique);
    setPacks((prev) => prev.filter((p) => !idSet.has(p.id)));
    setTasks((prev) => prev.filter((t) => !idSet.has(t.packId)));
  }, []);

  const itemsForPack = useCallback(
    (packId: string) => history.filter((h) => h.packId === packId),
    [history]
  );

  const value = useMemo(
    () => ({
      settings,
      history,
      packs,
      tasks,
      busy,
      refresh,
      processUrl,
      resumeMedia,
      cancelDownload,
      pauseDownload,
      updateSettings,
      clearHistory,
      clearPacks,
      removePacks,
      itemsForPack,
      registerQueueSink,
      queueUrls,
    }),
    [
      settings,
      history,
      packs,
      tasks,
      busy,
      refresh,
      processUrl,
      resumeMedia,
      cancelDownload,
      pauseDownload,
      updateSettings,
      clearHistory,
      clearPacks,
      removePacks,
      itemsForPack,
      registerQueueSink,
      queueUrls,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

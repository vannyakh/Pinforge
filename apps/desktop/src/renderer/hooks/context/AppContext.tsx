import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
}

interface AppContextValue {
  settings: AppSettings | null;
  history: HistoryItem[];
  packs: DownloadPack[];
  tasks: DownloadTask[];
  busy: boolean;
  refresh: () => Promise<void>;
  processUrl: (url: string, opts?: ProcessOpts) => Promise<ProcessResponse | null>;
  cancelDownload: () => Promise<boolean>;
  updateSettings: (partial: SettingsPartial) => Promise<void>;
  clearHistory: () => Promise<void>;
  clearPacks: () => Promise<void>;
  removePacks: (ids: string[]) => Promise<void>;
  itemsForPack: (packId: string) => HistoryItem[];
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [packs, setPacks] = useState<DownloadPack[]>([]);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [busy, setBusy] = useState(false);

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
        };
        const rest = prev.filter((t) => t.packId !== ev.packId);
        return [next, ...rest].slice(0, 30);
      });
    });
  }, []);

  const processUrl = useCallback(
    async (url: string, opts?: ProcessOpts): Promise<ProcessResponse | null> => {
      if (!settings) return null;
      setBusy(true);
      try {
        const res = await api.processMedia({
          url,
          preset: opts?.preset ?? settings.preset,
          outDir: opts?.outDir ?? settings.outDir,
          enhance: opts?.enhance ?? settings.enhance,
          format: opts?.format ?? settings.format,
          features: opts?.features ?? settings.enhanceFeatures,
          youtube: opts?.youtube ?? settings.youtube,
        });
        const stopped = res.errors.some((e) => /stopped/i.test(e.error));
        if (
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
        if (!/abort|stopped/i.test(msg)) {
          Message.error(msg);
        }
        await refresh();
        return null;
      } finally {
        setBusy(false);
      }
    },
    [settings, refresh]
  );

  const cancelDownload = useCallback(async () => {
    const res = await api.cancelMedia();
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
            youtube: next.youtube ? { ...prev.youtube, ...next.youtube } : prev.youtube,
          }
        : prev
    );
  }, []);

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
      cancelDownload,
      updateSettings,
      clearHistory,
      clearPacks,
      removePacks,
      itemsForPack,
    }),
    [
      settings,
      history,
      packs,
      tasks,
      busy,
      refresh,
      processUrl,
      cancelDownload,
      updateSettings,
      clearHistory,
      clearPacks,
      removePacks,
      itemsForPack,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

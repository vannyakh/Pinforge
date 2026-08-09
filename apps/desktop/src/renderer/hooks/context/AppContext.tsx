import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Message } from "@arco-design/web-react";
import {
  api,
  type AppSettings,
  type HistoryItem,
  type DownloadPack,
  type FormatPreset,
  type SettingsPartial,
  type MediaProgressEvent,
  type PackStatus,
} from "@renderer/api";

interface ProcessOpts {
  enhance?: boolean;
  format?: FormatPreset;
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
}

interface AppContextValue {
  settings: AppSettings | null;
  history: HistoryItem[];
  packs: DownloadPack[];
  tasks: DownloadTask[];
  busy: boolean;
  refresh: () => Promise<void>;
  processUrl: (url: string, opts?: ProcessOpts) => Promise<void>;
  updateSettings: (partial: SettingsPartial) => Promise<void>;
  clearHistory: () => Promise<void>;
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
        };
        const rest = prev.filter((t) => t.packId !== ev.packId);
        return [next, ...rest].slice(0, 30);
      });
    });
  }, []);

  const processUrl = useCallback(
    async (url: string, opts?: ProcessOpts) => {
      if (!settings) return;
      setBusy(true);
      Message.loading({ id: "pin-process", content: "Downloading…", duration: 0 });
      try {
        const res = await api.processMedia({
          url,
          preset: settings.preset,
          outDir: settings.outDir,
          enhance: opts?.enhance ?? settings.enhance,
          format: opts?.format ?? settings.format,
        });
        Message.clear();
        const ok = res.results.length;
        const fail = res.errors.length;
        Message.success(
          res.kind === "board"
            ? `Done — ${ok} saved${fail ? `, ${fail} failed` : ""}`
            : `Saved${res.provider ? ` (${res.provider})` : ""}`
        );
        if (
          settings.system?.notifications &&
          settings.system.notifyOnDownloadComplete &&
          typeof Notification !== "undefined"
        ) {
          try {
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
      } catch (e) {
        Message.clear();
        Message.error(e instanceof Error ? e.message : String(e));
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [settings, refresh]
  );

  const updateSettings = useCallback(async (partial: SettingsPartial) => {
    const next = await api.setSettings(partial);
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            ...next,
            system: next.system ?? prev.system,
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
      updateSettings,
      clearHistory,
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
      updateSettings,
      clearHistory,
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

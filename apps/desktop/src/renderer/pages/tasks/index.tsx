import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Empty,
  Input,
  Message,
  Modal,
  Progress,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "@arco-design/web-react";
import type { ColumnProps, SorterInfo } from "@arco-design/web-react/es/Table/interface";
import { Clear, Close, Delete, FolderOpen, Pause, PlayOne, Plus, Redo, Remind } from "@icon-park/react";
import { useApp } from "@renderer/hooks/context/AppContext";
import { api, type FormatPreset, type PackStatus, type PresetName, type YoutubeQuality, type AudioContainer, type SubtitleMode } from "@renderer/api";

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const matches = text.match(URL_RE) ?? [];
  for (const raw of matches) {
    const url = raw.replace(/[),.;!?]+$/g, "");
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

const FORMAT_OPTIONS: { value: FormatPreset; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "mp4", label: "MP4" },
  { value: "audio-only", label: "Audio only" },
];

type TaskRowStatus = PackStatus | "queued";

type CollectionKind = "board" | "playlist" | "profile" | "collection";

type QueuedJob = {
  id: string;
  url: string;
  addedAt: number;
  opts: {
    enhance: boolean;
    format: FormatPreset;
    preset: PresetName;
    outDir: string;
    youtube: {
      quality: YoutubeQuality;
      audioContainer: AudioContainer;
      subtitles: SubtitleMode;
    };
  };
};

type TaskRow = {
  id: string;
  url: string;
  title?: string;
  status: TaskRowStatus;
  message?: string;
  updatedAt: number;
  createdAt: number;
  current: number;
  total: number;
  files: number;
  errors: number;
  provider?: string;
  preset?: string;
  percent: number;
  downloadedBytes?: number;
  estimateBytes?: number | null;
  etaSec?: number | null;
  queued?: boolean;
  /** Board / playlist / profile collection parent. */
  collection?: CollectionKind | null;
  /** Nested file rows under a collection pack. */
  children?: TaskRow[];
  parentId?: string;
  isChild?: boolean;
};

function statusColor(status: TaskRowStatus): string {
  switch (status) {
    case "running":
      return "arcoblue";
    case "queued":
      return "purple";
    case "done":
      return "green";
    case "partial":
      return "orange";
    case "failed":
      return "red";
    default:
      return "gray";
  }
}

function statusLabel(status: TaskRowStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "queued":
      return "Queued";
    case "done":
      return "Done";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function statusRank(status: TaskRowStatus): number {
  switch (status) {
    case "running":
      return 0;
    case "queued":
      return 1;
    case "partial":
      return 2;
    case "failed":
      return 3;
    case "done":
      return 4;
    default:
      return 5;
  }
}

function formatDateTime(ts: number): { primary: string; secondary: string; full: string } {
  const d = new Date(ts);
  const full = d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  let secondary: string;
  if (ts >= startToday) secondary = "Today";
  else if (ts >= startYesterday) secondary = "Yesterday";
  else {
    secondary = d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
    });
  }
  return { primary: time, secondary, full };
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function fileNameFromPath(p: string): string {
  return p.split(/[/\\]/).filter(Boolean).pop() || p;
}

/** Detect collection-style downloads (board / playlist / profile). */
function classifyCollection(
  url: string,
  provider?: string,
  itemCount = 0
): CollectionKind | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname;

    if (provider === "pinterest" || /pinterest\.com$/i.test(host)) {
      if (/\/pin\//i.test(path)) return itemCount > 1 ? "collection" : null;
      return "board";
    }

    if (/youtube\.com$|youtu\.be$/i.test(host)) {
      if (/\/playlist/i.test(path) || (!u.searchParams.has("v") && u.searchParams.has("list"))) {
        return "playlist";
      }
      if (/^\/(channel|c|user)\//i.test(path) || /^\/@/.test(path)) return "profile";
    }

    if (/instagram\.com$/i.test(host)) {
      if (/\/(p|reel|tv)\//i.test(path) || /\/stories\//i.test(path)) {
        return itemCount > 1 ? "collection" : null;
      }
      return "profile";
    }

    if (/tiktok\.com$/i.test(host)) {
      if (/\/video\//i.test(path)) return itemCount > 1 ? "collection" : null;
      if (/\/@[^/]+\/?$/i.test(path)) return "profile";
    }
  } catch {
    /* ignore */
  }
  return itemCount > 1 ? "collection" : null;
}

function collectionLabel(kind: CollectionKind | null | undefined): string {
  switch (kind) {
    case "board":
      return "Board";
    case "playlist":
      return "Playlist";
    case "profile":
      return "Profile";
    case "collection":
      return "Collection";
    default:
      return "";
  }
}

function flattenTaskRows(list: TaskRow[]): TaskRow[] {
  const out: TaskRow[] = [];
  for (const row of list) {
    out.push(row);
    if (row.children?.length) out.push(...row.children);
  }
  return out;
}

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

/** Digital stopwatch HH:MM:SS (or MM:SS under 1h). */
function formatDigitalElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

function rowPercent(
  row: Pick<TaskRow, "current" | "total" | "status" | "downloadedBytes" | "estimateBytes">
): number {
  if (row.status === "queued") return 0;
  if (
    row.estimateBytes &&
    row.estimateBytes > 0 &&
    typeof row.downloadedBytes === "number" &&
    row.downloadedBytes >= 0
  ) {
    return Math.min(100, Math.round((row.downloadedBytes / row.estimateBytes) * 100));
  }
  if (row.total > 0 && (row.current > 0 || row.status === "done" || row.status === "partial")) {
    return Math.min(100, Math.round((row.current / row.total) * 100));
  }
  return row.status === "running" ? 30 : row.status === "failed" ? 0 : row.status === "done" ? 100 : 0;
}

const TasksPage: React.FC = () => {
  const {
    tasks,
    packs,
    busy,
    history,
    processUrl,
    itemsForPack,
    settings,
    updateSettings,
    clearPacks,
    removePacks,
    cancelDownload,
  } = useApp();
  const cardRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(360);
  const [selectedKeys, setSelectedKeys] = useState<(string | number)[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [addOutDir, setAddOutDir] = useState("");
  const [addFormat, setAddFormat] = useState<FormatPreset>("best");
  const [addPreset, setAddPreset] = useState<PresetName>("auto");
  const [addEnhance, setAddEnhance] = useState(true);
  const [addYtQuality, setAddYtQuality] = useState<YoutubeQuality>("best");
  const [addAudio, setAddAudio] = useState<AudioContainer>("m4a");
  const [addSubs, setAddSubs] = useState<SubtitleMode>("separate");
  const [sorted, setSorted] = useState<SorterInfo>({
    field: "updatedAt",
    direction: "descend",
  });
  const [disk, setDisk] = useState<{ free: number; total: number; path: string } | null>(null);
  const [packFileBytes, setPackFileBytes] = useState<Record<string, number>>({});
  const [fileBytesByPath, setFileBytesByPath] = useState<Record<string, number>>({});
  const [processElapsedSec, setProcessElapsedSec] = useState(0);
  const processStartedRef = useRef<number | null>(null);
  const [queue, setQueue] = useState<QueuedJob[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const stopBatchRef = useRef(false);
  const dragSelectRef = useRef<{
    active: boolean;
    startIndex: number;
    additive: boolean;
    baseKeys: (string | number)[];
  } | null>(null);
  const rowsRef = useRef<TaskRow[]>([]);
  const selectedKeysRef = useRef(selectedKeys);
  selectedKeysRef.current = selectedKeys;

  const detectedUrls = useMemo(() => extractUrls(addText), [addText]);
  const isProcessing = busy || batchRunning || tasks.some((t) => t.status === "running");
  const pushNotify = settings?.system?.notifyOnDownloadComplete !== false;

  useEffect(() => {
    if (!isProcessing) {
      processStartedRef.current = null;
      setProcessElapsedSec(0);
      return;
    }
    if (processStartedRef.current == null) {
      processStartedRef.current = Date.now();
      setProcessElapsedSec(0);
    }
    const started = processStartedRef.current;
    const tick = () => {
      setProcessElapsedSec(Math.floor((Date.now() - started) / 1000));
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [isProcessing]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!settings?.outDir) {
        setDisk(null);
        return;
      }
      const info = await api.diskSpace(settings.outDir);
      if (!cancelled) setDisk(info);
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [settings?.outDir, busy]);

  useEffect(() => {
    let cancelled = false;
    const paths = history.map((h) => h.outPath).filter(Boolean);
    if (paths.length === 0) {
      setPackFileBytes({});
      return;
    }
    void api.fileSizes(paths).then((sizes) => {
      if (cancelled) return;
      setFileBytesByPath(sizes);
      const byPack: Record<string, number> = {};
      for (const h of history) {
        const size = sizes[h.outPath];
        if (!h.packId || typeof size !== "number") continue;
        byPack[h.packId] = (byPack[h.packId] ?? 0) + size;
      }
      setPackFileBytes(byPack);
    });
    return () => {
      cancelled = true;
    };
  }, [history]);

  const openAddModal = () => {
    if (settings) {
      setAddOutDir(settings.outDir);
      setAddFormat(settings.format);
      setAddPreset(settings.preset);
      setAddEnhance(settings.enhance);
      setAddYtQuality(settings.youtube?.quality ?? "best");
      setAddAudio(settings.youtube?.audioContainer ?? "m4a");
      setAddSubs(settings.youtube?.subtitles ?? "separate");
    }
    setAddText("");
    setAddOpen(true);
  };

  const closeAddModal = () => {
    setAddOpen(false);
    setAddText("");
  };

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => {
      const batchBar = selectedKeys.length > 0 ? 44 : 0;
      setScrollY(Math.max(180, el.clientHeight - 48 - batchBar));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedKeys.length]);

  const baseRows = useMemo(() => {
    const byId = new Map<string, TaskRow>();

    for (const p of packs) {
      const current = p.itemIds.length;
      const total = Math.max(current + p.errorCount, 1);
      const savedBytes = packFileBytes[p.id];
      const draft: TaskRow = {
        id: p.id,
        url: p.url,
        title: p.title,
        status: p.status,
        message: undefined,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        current,
        total,
        files: current,
        errors: p.errorCount,
        provider: p.provider,
        preset: p.preset,
        percent: 0,
        downloadedBytes: savedBytes,
        estimateBytes: savedBytes,
      };
      draft.percent = rowPercent(draft);
      byId.set(p.id, draft);
    }

    for (const t of tasks) {
      const prev = byId.get(t.packId);
      const savedBytes = packFileBytes[t.packId];
      const estimate =
        typeof t.totalBytes === "number" && t.totalBytes > 0
          ? t.totalBytes
          : prev?.estimateBytes ?? savedBytes ?? null;
      const downloaded =
        typeof t.downloaded === "number"
          ? t.downloaded
          : t.status !== "running"
            ? savedBytes ?? prev?.downloadedBytes
            : prev?.downloadedBytes;
      const next: TaskRow = {
        id: t.packId,
        url: t.url,
        title: t.title ?? prev?.title,
        status: t.status,
        message: t.message ?? prev?.message,
        updatedAt: Math.max(t.updatedAt, prev?.updatedAt ?? 0),
        createdAt: prev?.createdAt ?? t.updatedAt,
        current: t.current,
        total: t.total || prev?.total || 1,
        files: prev?.files ?? t.current,
        errors: prev?.errors ?? 0,
        provider: prev?.provider,
        preset: prev?.preset,
        percent: 0,
        downloadedBytes: downloaded,
        estimateBytes: estimate,
        etaSec: t.etaSec,
      };
      next.percent =
        typeof t.percent === "number" && t.status === "running"
          ? t.percent
          : rowPercent(next);
      byId.set(t.packId, next);
    }

    if (busy && ![...byId.values()].some((r) => r.status === "running")) {
      byId.set("pending", {
        id: "pending",
        url: "…",
        status: "running",
        message: "Starting…",
        updatedAt: Date.now(),
        createdAt: Date.now(),
        current: 0,
        total: 1,
        files: 0,
        errors: 0,
        percent: 30,
      });
    }

    for (const q of queue) {
      if ([...byId.values()].some((r) => r.url === q.url && r.status === "running")) continue;
      const collection = classifyCollection(q.url, undefined, 0);
      byId.set(q.id, {
        id: q.id,
        url: q.url,
        status: "queued",
        message: collection
          ? `${collectionLabel(collection)} waiting to start`
          : "Waiting to start",
        updatedAt: q.addedAt,
        createdAt: q.addedAt,
        current: 0,
        total: 1,
        files: 0,
        errors: 0,
        percent: 0,
        queued: true,
        preset: q.opts.preset,
        collection,
      });
    }

    // Attach tree children for collection packs (board / playlist / profile / multi-file)
    for (const row of byId.values()) {
      if (row.queued || row.id === "pending" || row.isChild) continue;
      const items = history.filter((h) => h.packId === row.id);
      const itemCount = Math.max(items.length, row.files, row.total > 1 ? row.total : 0);
      const collection =
        row.collection ?? classifyCollection(row.url, row.provider, itemCount);
      row.collection = collection;

      if (items.length > 1 || (collection && items.length >= 1 && itemCount > 1)) {
        row.children = items.map((h) => {
          const size = fileBytesByPath[h.outPath];
          const child: TaskRow = {
            id: h.id,
            url: h.url || row.url,
            title: h.title || fileNameFromPath(h.outPath),
            status: "done",
            message: h.kind ? String(h.kind) : undefined,
            updatedAt: h.createdAt,
            createdAt: h.createdAt,
            current: 1,
            total: 1,
            files: 1,
            errors: 0,
            provider: h.provider ?? row.provider,
            preset: h.preset ?? row.preset,
            percent: 100,
            downloadedBytes: size,
            estimateBytes: size,
            parentId: row.id,
            isChild: true,
          };
          return child;
        });
        if (row.children.length <= 1 && !collection) {
          delete row.children;
        }
      }
    }

    return [...byId.values()];
  }, [tasks, packs, busy, packFileBytes, fileBytesByPath, queue, history]);

  const rows = useMemo(() => {
    const list = [...baseRows];
    const field = (sorted.field as keyof TaskRow | undefined) ?? "updatedAt";
    const dir = sorted.direction === "ascend" ? 1 : -1;

    list.sort((a, b) => {
      // Keep running jobs pinned unless sorting by status explicitly
      if (field !== "status") {
        const aRun = a.status === "running" ? 2 : a.status === "queued" ? 1 : 0;
        const bRun = b.status === "running" ? 2 : b.status === "queued" ? 1 : 0;
        if (aRun !== bRun) return bRun - aRun;
      }

      let cmp = 0;
      switch (field) {
        case "title":
        case "url":
          cmp = (a.title || a.url).localeCompare(b.title || b.url);
          break;
        case "provider":
          cmp = (a.provider || "").localeCompare(b.provider || "");
          break;
        case "status":
          cmp = statusRank(a.status) - statusRank(b.status);
          break;
        case "percent":
        case "current":
          cmp = a.percent - b.percent;
          break;
        case "estimateBytes":
          cmp = (a.estimateBytes ?? 0) - (b.estimateBytes ?? 0);
          break;
        case "downloadedBytes":
          cmp = (a.downloadedBytes ?? 0) - (b.downloadedBytes ?? 0);
          break;
        case "files":
          cmp = a.files - b.files;
          break;
        case "updatedAt":
        default:
          cmp = a.updatedAt - b.updatedAt;
          break;
      }
      return cmp * dir;
    });
    return list;
  }, [baseRows, sorted]);

  rowsRef.current = rows;

  useEffect(() => {
    const endDrag = () => {
      dragSelectRef.current = null;
      document.body.classList.remove("tasks-drag-selecting");
    };
    window.addEventListener("mouseup", endDrag);
    return () => window.removeEventListener("mouseup", endDrag);
  }, []);

  const applyDragRange = (endIndex: number) => {
    const drag = dragSelectRef.current;
    if (!drag?.active) return;
    const list = rowsRef.current;
    const a = Math.min(drag.startIndex, endIndex);
    const b = Math.max(drag.startIndex, endIndex);
    const rangeIds = list
      .slice(a, b + 1)
      .map((r) => r.id)
      .filter((id) => id !== "pending");
    if (drag.additive) {
      const set = new Set(drag.baseKeys.map(String));
      for (const id of rangeIds) set.add(String(id));
      setSelectedKeys([...set]);
    } else {
      setSelectedKeys(rangeIds);
    }
  };

  const openFolder = (row: TaskRow) => {
    if (row.isChild) {
      const item = history.find((h) => h.id === row.id);
      if (item?.outPath) {
        void api.showItemInFolder(item.outPath);
        return;
      }
    }
    const items = itemsForPack(row.id);
    const first = items[0] ?? history.find((h) => h.packId === row.id);
    if (first?.outPath) {
      void api.showItemInFolder(first.outPath);
      return;
    }
    if (settings?.outDir) void api.openPath(settings.outDir);
  };

  const selectedRows = useMemo(
    () =>
      flattenTaskRows(rows).filter(
        (r) => selectedKeys.includes(r.id) && r.id !== "pending"
      ),
    [rows, selectedKeys]
  );

  const selectedSize = useMemo(() => {
    let estimate = 0;
    let downloaded = 0;
    let hasEstimate = false;
    let hasDownloaded = false;
    for (const r of selectedRows) {
      if (typeof r.estimateBytes === "number" && r.estimateBytes > 0) {
        estimate += r.estimateBytes;
        hasEstimate = true;
      }
      if (typeof r.downloadedBytes === "number" && r.downloadedBytes > 0) {
        downloaded += r.downloadedBytes;
        hasDownloaded = true;
      }
    }
    return {
      estimate: hasEstimate ? estimate : null,
      downloaded: hasDownloaded ? downloaded : null,
    };
  }, [selectedRows]);

  const batchRetry = async () => {
    const list = selectedRows.filter(
      (r) => r.status !== "running" && r.url && r.url !== "…"
    );
    for (const r of list) {
      if (r.status === "queued" || r.queued) {
        const queued = queue.find((q) => q.id === r.id);
        setQueue((prev) => prev.filter((q) => q.id !== r.id));
        await processUrl(r.url, queued?.opts);
      } else {
        await processUrl(r.url);
      }
    }
    setSelectedKeys([]);
  };

  const removeFromList = async (targets: TaskRow[]) => {
    const packOrQueueIds = new Set<string>();
    for (const t of targets) {
      if (t.id === "pending") continue;
      if (t.isChild && t.parentId) packOrQueueIds.add(t.parentId);
      else packOrQueueIds.add(t.id);
    }
    const ids = [...packOrQueueIds];
    const queuedIds = ids.filter((id) => queue.some((q) => q.id === id));
    const packIds = ids.filter((id) => !queuedIds.includes(id));
    if (queuedIds.length === 0 && packIds.length === 0) return;
    if (targets.some((r) => r.status === "running" || (r.parentId && rows.find((p) => p.id === r.parentId)?.status === "running"))) {
      Message.warning("Stop or wait for running jobs before removing them.");
      return;
    }
    if (queuedIds.length > 0) {
      setQueue((prev) => prev.filter((q) => !queuedIds.includes(q.id)));
    }
    if (packIds.length > 0) {
      await removePacks(packIds);
    }
    const removed = new Set([...queuedIds, ...packIds]);
    setSelectedKeys((prev) =>
      prev.filter((k) => {
        const key = String(k);
        if (removed.has(key)) return false;
        const child = flattenTaskRows(rows).find((r) => r.id === key);
        if (child?.parentId && removed.has(child.parentId)) return false;
        return true;
      })
    );
    Message.success(removed.size === 1 ? "Removed from list" : `Removed ${removed.size} from list`);
  };
  const unfinishedRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          !r.isChild &&
          r.id !== "pending" &&
          r.url &&
          r.url !== "…" &&
          (r.status === "queued" || r.status === "failed" || r.status === "partial")
      ),
    [rows]
  );

  const startLabel =
    unfinishedRows.some((r) => r.status === "failed" || r.status === "partial") ||
    (unfinishedRows.length > 0 && rows.some((r) => r.status === "done"))
      ? "Continue"
      : "Start";

  const stopDownloads = async () => {
    stopBatchRef.current = true;
    const ok = await cancelDownload();
    Message.info(ok ? "Stopping…" : "No active download");
  };

  const startOrContinueDownloads = async () => {
    if (isProcessing || batchRunning) {
      await stopDownloads();
      return;
    }
    const jobs = unfinishedRows;
    if (jobs.length === 0) {
      Message.info("Nothing left to download.");
      return;
    }
    stopBatchRef.current = false;
    setBatchRunning(true);
    setSelectedKeys([]);
    let stopped = false;
    let doneCount = 0;
    try {
      for (const job of jobs) {
        if (stopBatchRef.current) {
          stopped = true;
          break;
        }
        if (job.status === "queued" || job.queued) {
          const queued = queue.find((q) => q.id === job.id);
          setQueue((prev) => prev.filter((q) => q.id !== job.id && q.url !== job.url));
          const res = await processUrl(job.url, queued?.opts);
          if (stopBatchRef.current || res?.errors.some((e) => /stopped/i.test(e.error))) {
            stopped = true;
            // Re-queue remaining if stopped mid-item
            if (stopBatchRef.current && job.url) {
              setQueue((prev) => {
                if (prev.some((q) => q.url === job.url)) return prev;
                return [
                  ...prev,
                  {
                    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    url: job.url,
                    addedAt: Date.now(),
                    opts: queued?.opts ?? {
                      enhance: settings?.enhance ?? true,
                      format: settings?.format ?? "best",
                      preset: settings?.preset ?? "auto",
                      outDir: settings?.outDir ?? "",
                      youtube: {
                        quality: settings?.youtube?.quality ?? "best",
                        audioContainer: settings?.youtube?.audioContainer ?? "m4a",
                        subtitles: settings?.youtube?.subtitles ?? "separate",
                      },
                    },
                  },
                ];
              });
            }
            break;
          }
          doneCount += 1;
        } else {
          const res = await processUrl(job.url);
          if (stopBatchRef.current || res?.errors.some((e) => /stopped/i.test(e.error))) {
            stopped = true;
            break;
          }
          doneCount += 1;
        }
      }
      if (stopped) Message.info("Stopped — press Continue to resume");
      else Message.success(doneCount ? "Downloads finished" : "Nothing to download");
    } finally {
      setBatchRunning(false);
      stopBatchRef.current = false;
    }
  };

  const toggleStartStop = () => {
    if (isProcessing || batchRunning) void stopDownloads();
    else void startOrContinueDownloads();
  };

  const submitAddTask = () => {
    const urls = extractUrls(addText);
    if (urls.length === 0) {
      Message.warning("Paste one or more media URLs to start.");
      return;
    }
    const outDir = addOutDir.trim() || settings?.outDir;
    if (!outDir) {
      Message.warning("Set a download folder first.");
      return;
    }
    const opts = {
      enhance: addEnhance,
      format: addFormat,
      preset: addPreset,
      outDir,
      youtube: {
        quality: addYtQuality,
        audioContainer: addAudio,
        subtitles: addSubs,
      },
    };
    const existing = new Set([
      ...queue.map((q) => q.url),
      ...packs.map((p) => p.url),
    ]);
    const nextJobs: QueuedJob[] = [];
    for (const url of urls) {
      if (existing.has(url)) continue;
      existing.add(url);
      nextJobs.push({
        id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url,
        addedAt: Date.now(),
        opts,
      });
    }
    closeAddModal();
    if (nextJobs.length === 0) {
      Message.info("Those links are already in the list.");
      return;
    }
    setQueue((prev) => [...prev, ...nextJobs]);
    Message.success(
      nextJobs.length === 1
        ? "Added to queue — press Start to download"
        : `Queued ${nextJobs.length} links — press Start to download`
    );
  };

  const pickAddFolder = async () => {
    const dir = await api.pickFolder();
    if (!dir) return;
    setAddOutDir(dir);
    void updateSettings({ outDir: dir });
    const info = await api.diskSpace(dir);
    setDisk(info);
  };

  const columns: ColumnProps<TaskRow>[] = [
    {
      title: "#",
      width: 52,
      align: "center",
      fixed: "left",
      render: (_col, _row, index) => (
        <span className="tasks-table__index tabular-nums">{index + 1}</span>
      ),
    },
    {
      title: "Task",
      dataIndex: "url",
      fixed: "left",
      width: 360,
      sorter: true,
      ellipsis: true,
      render: (_col, row) => (
        <div className="min-w-0 py-2px tasks-table__task">
          <Tooltip content={row.url}>
            <div className="text-13px font-500 text-t-primary truncate flex items-center gap-6px">
              <span className="truncate">{row.title?.trim() || row.url}</span>
              {!row.isChild && row.collection && (
                <Tag size="small" color="arcoblue" className="tasks-table__collection shrink-0">
                  {collectionLabel(row.collection)}
                  {row.files > 1 ? ` · ${row.files}` : row.children && row.children.length > 1
                    ? ` · ${row.children.length}`
                    : ""}
                </Tag>
              )}
              {row.isChild && (
                <span className="tasks-table__child-mark text-11px text-t-tertiary shrink-0">
                  item
                </span>
              )}
            </div>
          </Tooltip>
          {row.message && row.status !== "done" && (
            <Tooltip content={row.message}>
              <div className="text-12px text-t-tertiary mt-2px truncate">{row.message}</div>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: "Source",
      dataIndex: "provider",
      width: 120,
      sorter: true,
      render: (_col, row) => {
        if (row.isChild) {
          return (
            <span className="text-12px text-t-tertiary truncate block">
              {row.message || "file"}
            </span>
          );
        }
        const label = row.provider || hostFromUrl(row.url) || "—";
        return (
          <Tag size="small" color="gray" className="tasks-table__source">
            {label}
          </Tag>
        );
      },
    },
    {
      title: "Prog.",
      dataIndex: "percent",
      width: 140,
      sorter: true,
      render: (_col, row) => (
        <div className="tasks-table__prog">
          <Progress
            percent={row.percent}
            size="small"
            showText={false}
            status={row.status === "failed" ? "error" : undefined}
          />
          <div className="text-11px text-t-secondary mt-2px tabular-nums">
            {row.status === "running"
              ? `${row.current}/${row.total}${
                  typeof row.etaSec === "number" && row.etaSec > 0
                    ? ` · ${row.etaSec < 60 ? `${row.etaSec}s` : `${Math.ceil(row.etaSec / 60)}m`}`
                    : ""
                }`
              : `${row.percent}% · ${row.current}/${row.total}`}
          </div>
        </div>
      ),
    },
    {
      title: "Downloaded",
      dataIndex: "downloadedBytes",
      width: 110,
      sorter: true,
      render: (_col, row) => (
        <div className="tasks-table__size leading-tight">
          <div className="text-12px text-t-primary tabular-nums font-500">
            {formatBytes(row.downloadedBytes)}
          </div>
          <div className="text-11px text-t-tertiary">
            {row.status === "running" ? "so far" : row.status === "done" ? "saved" : "—"}
          </div>
        </div>
      ),
    },
    {
      title: "Estimate",
      dataIndex: "estimateBytes",
      width: 110,
      sorter: true,
      render: (_col, row) => (
        <div className="tasks-table__size leading-tight">
          <div className="text-12px text-t-primary tabular-nums font-500">
            {formatBytes(row.estimateBytes)}
          </div>
          <div className="text-11px text-t-tertiary">
            {row.status === "running" && row.estimateBytes
              ? "selected"
              : row.estimateBytes
                ? "total"
                : "unknown"}
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 100,
      align: "center",
      sorter: true,
      render: (_col, row) => (
        <Tag color={statusColor(row.status)} size="small">
          {statusLabel(row.status)}
        </Tag>
      ),
    },
    {
      title: "Files",
      dataIndex: "files",
      width: 88,
      align: "center",
      sorter: true,
      render: (_col, row) => (
        <div className="text-12px tabular-nums leading-tight">
          <div className="text-t-primary font-500">{row.files}</div>
          <div className="text-11px text-t-tertiary">
            {row.errors > 0 ? <span className="text-danger">{row.errors} err</span> : "saved"}
          </div>
        </div>
      ),
    },
    {
      title: "Preset",
      dataIndex: "preset",
      width: 100,
      render: (_col, row) => (
        <span className="text-12px text-t-secondary truncate block">
          {row.preset || settings?.preset || "—"}
        </span>
      ),
    },
    {
      title: "Updated",
      dataIndex: "updatedAt",
      width: 120,
      sorter: true,
      defaultSortOrder: "descend",
      render: (_col, row) => {
        const dt = formatDateTime(row.updatedAt);
        return (
          <Tooltip content={dt.full}>
            <div className="tasks-table__time leading-tight">
              <div className="text-12px text-t-primary tabular-nums">{dt.primary}</div>
              <div className="text-11px text-t-tertiary">{dt.secondary}</div>
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: "Actions",
      width: 96,
      align: "right",
      fixed: "right",
      render: (_col, row) => {
        if (row.id === "pending") return null;
        const canOpen =
          (row.files > 0 || row.isChild) && row.status !== "running";
        const canRetry =
          !row.isChild &&
          (row.status === "failed" || row.status === "partial" || row.status === "done");
        return (
          <div className="tasks-table__actions flex items-center justify-end gap-2px">
            {canOpen && (
              <Tooltip content="Reveal in folder">
                <Button
                  type="text"
                  size="mini"
                  icon={<FolderOpen theme="outline" size="14" />}
                  onClick={() => openFolder(row)}
                />
              </Tooltip>
            )}
            {canRetry && row.url && row.url !== "…" && (
              <Tooltip content="Retry download">
                <Button
                  type="text"
                  size="mini"
                  icon={<Redo theme="outline" size="14" />}
                  onClick={() => void processUrl(row.url)}
                />
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  const confirmClearList = () => {
    if (rows.length === 0) {
      Message.info("Task list is already empty.");
      return;
    }
    Modal.confirm({
      title: "Clear task list?",
      content: "Removes all jobs from this list. Saved files in Gallery stay.",
      okText: "Clear list",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        await clearPacks();
        setQueue([]);
        setSelectedKeys([]);
        Message.success("Task list cleared");
      },
    });
  };

  const onRow = (record: TaskRow) => ({
    className: selectedKeys.includes(record.id) ? "tasks-row-selected" : undefined,
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0 || record.id === "pending" || record.isChild) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, .arco-checkbox, .arco-table-expand-icon")) return;
      const index = rowsRef.current.findIndex((r) => r.id === record.id);
      if (index < 0) return;
      dragSelectRef.current = {
        active: true,
        startIndex: index,
        additive: e.metaKey || e.ctrlKey || e.shiftKey,
        baseKeys: selectedKeysRef.current,
      };
      document.body.classList.add("tasks-drag-selecting");
      applyDragRange(index);
    },
    onMouseEnter: () => {
      if (!dragSelectRef.current?.active || record.isChild) return;
      const index = rowsRef.current.findIndex((r) => r.id === record.id);
      if (index < 0) return;
      applyDragRange(index);
    },
  });

  return (
    <div className="tasks-page flex flex-col flex-1 min-h-0 h-full w-full">
      <div className="shrink-0 mb-14px">
        <div className="flex items-center justify-between gap-16px mb-6px">
          <div className="flex items-center gap-12px min-w-0">
            <div className="text-22px font-600 text-t-primary">Tasks</div>
            <div
              className={`tasks-digital${isProcessing ? " is-live" : ""}`}
              title={isProcessing ? "Elapsed since process started" : "Idle"}
              aria-live="polite"
            >
              <span className="tasks-digital__label">{isProcessing ? "RUN" : "IDLE"}</span>
              <span className="tasks-digital__time">{formatDigitalElapsed(processElapsedSec)}</span>
            </div>
          </div>
          <Space size={8} className="tasks-header-actions shrink-0 flex-wrap justify-end">
            {selectedKeys.length > 0 ? (
              <>
                <span className="tasks-header-selected text-13px text-t-secondary tabular-nums">
                  {selectedKeys.length}
                  <span className="tasks-header-btn__label"> selected</span>
                </span>
                <Tooltip content="Retry selected">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    icon={<Redo theme="outline" size="14" />}
                    disabled={selectedRows.every((r) => r.status === "running") || busy}
                    onClick={() => void batchRetry()}
                    aria-label="Retry selected"
                  >
                    <span className="tasks-header-btn__label">Retry</span>
                  </Button>
                </Tooltip>
                <Tooltip content="Remove selected from list">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    status="danger"
                    icon={<Delete theme="outline" size="14" />}
                    disabled={busy || selectedRows.some((r) => r.status === "running")}
                    onClick={() => void removeFromList(selectedRows)}
                    aria-label="Remove selected"
                  >
                    <span className="tasks-header-btn__label">Remove</span>
                  </Button>
                </Tooltip>
                <Tooltip content="Clear selection">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    icon={<Close theme="outline" size="14" />}
                    onClick={() => setSelectedKeys([])}
                    aria-label="Clear selection"
                  >
                    <span className="tasks-header-btn__label">Deselect</span>
                  </Button>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip
                  content={
                    isProcessing || batchRunning
                      ? "Stop current download — Continue later resumes the queue"
                      : unfinishedRows.length === 0
                        ? "Add links that are not downloaded yet"
                        : `${startLabel} ${unfinishedRows.length} unfinished download${unfinishedRows.length === 1 ? "" : "s"}`
                  }
                >
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type={isProcessing || batchRunning ? "outline" : "primary"}
                    status={isProcessing || batchRunning ? "danger" : undefined}
                    icon={
                      isProcessing || batchRunning ? (
                        <Pause theme="outline" size="14" />
                      ) : (
                        <PlayOne theme="outline" size="14" />
                      )
                    }
                    disabled={!(isProcessing || batchRunning) && unfinishedRows.length === 0}
                    onClick={toggleStartStop}
                    aria-label={isProcessing || batchRunning ? "Stop" : startLabel}
                  >
                    <span className="tasks-header-btn__label">
                      {isProcessing || batchRunning ? "Stop" : startLabel}
                    </span>
                  </Button>
                </Tooltip>
                <Tooltip content={pushNotify ? "Push notify: on" : "Push notify: off"}>
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type={pushNotify ? "primary" : "outline"}
                    icon={<Remind theme="outline" size="14" />}
                    onClick={() =>
                      void updateSettings({
                        system: {
                          ...(settings?.system ?? {}),
                          notifyOnDownloadComplete: !pushNotify,
                        },
                      })
                    }
                    aria-label="Push notifications"
                    aria-pressed={pushNotify}
                  >
                    <span className="tasks-header-btn__label">Push</span>
                  </Button>
                </Tooltip>
                <Tooltip content="Clear task list">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    status="danger"
                    icon={<Clear theme="outline" size="14" />}
                    disabled={busy || rows.length === 0}
                    onClick={confirmClearList}
                    aria-label="Clear task list"
                  >
                    <span className="tasks-header-btn__label">Clear list</span>
                  </Button>
                </Tooltip>
                <Tooltip content="Add links to queue">
                  <Button
                    className="tasks-header-btn"
                    type="outline"
                    size="small"
                    icon={<Plus theme="outline" size="14" />}
                    disabled={busy}
                    onClick={openAddModal}
                    aria-label="Add links"
                  >
                    <span className="tasks-header-btn__label">Add</span>
                  </Button>
                </Tooltip>
              </>
            )}
          </Space>
        </div>
        <div className="text-t-secondary text-14px flex flex-wrap items-center gap-x-16px gap-y-4px">
          <span>
            Add links to the queue, then Start / Continue. Collections expand as a tree.
          </span>
          {disk && (
            <span className="tasks-disk tabular-nums text-13px">
              Free space{" "}
              <span className="text-t-primary font-500">{formatBytes(disk.free)}</span>
              <span className="text-t-tertiary"> / {formatBytes(disk.total)}</span>
            </span>
          )}
        </div>
        {selectedKeys.length > 0 && (selectedSize.estimate != null || selectedSize.downloaded != null) && (
          <div className="text-13px text-t-secondary mt-8px tabular-nums">
            Selected size
            {selectedSize.downloaded != null && (
              <>
                {" "}
                · downloaded <span className="text-t-primary font-500">{formatBytes(selectedSize.downloaded)}</span>
              </>
            )}
            {selectedSize.estimate != null && (
              <>
                {" "}
                · estimate <span className="text-t-primary font-500">{formatBytes(selectedSize.estimate)}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="tasks-table-card flex-1 min-h-0 w-full" ref={cardRef}>
        <Table
          className="tasks-table"
          rowKey="id"
          columns={columns}
          data={rows}
          pagination={false}
          border={false}
          hover
          tableLayoutFixed
          scroll={{ x: 1280, y: scrollY }}
          onRow={onRow}
          childrenColumnName="children"
          indentSize={18}
          defaultExpandAllRows={false}
          rowSelection={{
            type: "checkbox",
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys),
            checkStrictly: true,
            checkboxProps: (record) => ({
              disabled: record.id === "pending",
            }),
            fixed: true,
            columnWidth: 44,
          }}
          onChange={(_pagination, sorter) => {
            const next = Array.isArray(sorter) ? sorter[0] : sorter;
            if (!next?.direction) {
              setSorted({ field: "updatedAt", direction: "descend" });
              return;
            }
            setSorted({
              field: (next.field as string) || "updatedAt",
              direction: next.direction,
            });
          }}
          noDataElement={<Empty description="No tasks yet. Use + to add links." />}
        />
      </div>

      <Modal
        title="Add links"
        visible={addOpen}
        onCancel={closeAddModal}
        onOk={submitAddTask}
        okText={detectedUrls.length > 1 ? `Add to queue (${detectedUrls.length})` : "Add to queue"}
        okButtonProps={{ disabled: busy || detectedUrls.length === 0 || !addOutDir.trim() }}
        confirmLoading={busy}
        style={{ width: 560 }}
        unmountOnExit
      >
        <div className="flex flex-col gap-14px">
          <div>
            <div className="text-13px text-t-secondary mb-6px">Links</div>
            <Input.TextArea
              autoFocus
              value={addText}
              disabled={busy}
              placeholder={"Paste one or more URLs…\nMixed text is fine — links are extracted automatically."}
              autoSize={{ minRows: 5, maxRows: 10 }}
              onChange={setAddText}
            />
            <div className="text-12px text-t-tertiary mt-6px">
              {detectedUrls.length === 0
                ? "No URLs detected yet"
                : `${detectedUrls.length} URL${detectedUrls.length === 1 ? "" : "s"} detected`}
            </div>
          </div>

          <div>
            <div className="text-13px text-t-secondary mb-6px">Save to</div>
            <div className="flex items-center gap-8px">
              <Input
                value={addOutDir}
                disabled={busy}
                placeholder="Download folder"
                onChange={setAddOutDir}
                className="flex-1"
              />
              <Button
                icon={<FolderOpen theme="outline" size="14" />}
                disabled={busy}
                onClick={() => void pickAddFolder()}
              >
                Browse
              </Button>
            </div>
            {disk && (
              <div className="text-12px text-t-tertiary mt-6px tabular-nums">
                Free space on disk:{" "}
                <span className="text-t-secondary">{formatBytes(disk.free)}</span>
                {" · "}
                {formatBytes(disk.total)} total
              </div>
            )}
          </div>

          <div className="flex gap-12px">
            <div className="flex-1 min-w-0">
              <div className="text-13px text-t-secondary mb-6px">Format</div>
              <Select
                value={addFormat}
                disabled={busy}
                onChange={(v) => setAddFormat(v as FormatPreset)}
                options={FORMAT_OPTIONS}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-13px text-t-secondary mb-6px">Preset</div>
              <Select
                value={addPreset}
                disabled={busy || !addEnhance}
                onChange={(v) => setAddPreset(v as PresetName)}
                options={
                  settings
                    ? (Object.keys(settings.presets) as PresetName[]).map((key) => ({
                        value: key,
                        label: settings.presets[key].label,
                      }))
                    : []
                }
              />
            </div>
          </div>

          <div className="flex gap-12px">
            <div className="flex-1 min-w-0">
              <div className="text-13px text-t-secondary mb-6px">YouTube quality</div>
              <Select
                value={addYtQuality}
                disabled={busy || addFormat === "audio-only"}
                onChange={(v) => setAddYtQuality(v as YoutubeQuality)}
                options={[
                  { value: "best", label: "Best" },
                  { value: "2160", label: "2160p" },
                  { value: "1440", label: "1440p" },
                  { value: "1080", label: "1080p" },
                  { value: "720", label: "720p" },
                  { value: "480", label: "480p" },
                  { value: "360", label: "360p" },
                ]}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-13px text-t-secondary mb-6px">Audio / Subs</div>
              <div className="flex gap-8px">
                <Select
                  className="flex-1"
                  value={addAudio}
                  disabled={busy || addFormat !== "audio-only"}
                  onChange={(v) => setAddAudio(v as AudioContainer)}
                  options={[
                    { value: "m4a", label: "M4A" },
                    { value: "mp3", label: "MP3" },
                    { value: "flac", label: "FLAC" },
                  ]}
                />
                <Select
                  className="flex-1"
                  value={addSubs}
                  disabled={busy}
                  onChange={(v) => setAddSubs(v as SubtitleMode)}
                  options={[
                    { value: "none", label: "No subs" },
                    { value: "separate", label: "Subs file" },
                    { value: "embed", label: "Embed" },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-12px">
            <div className="flex items-center gap-8px">
              <Switch checked={addEnhance} disabled={busy} onChange={setAddEnhance} size="small" />
              <span className="text-13px text-t-secondary">Enhance stills</span>
            </div>
            <span className="text-12px text-t-tertiary">Queued — press Start to download</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TasksPage;

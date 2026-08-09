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
import { FolderOpen, Plus, Redo } from "@icon-park/react";
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

function statusColor(status: PackStatus): string {
  switch (status) {
    case "running":
      return "arcoblue";
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

function statusLabel(status: PackStatus): string {
  switch (status) {
    case "running":
      return "Running";
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

function statusRank(status: PackStatus): number {
  switch (status) {
    case "running":
      return 0;
    case "partial":
      return 1;
    case "failed":
      return 2;
    case "done":
      return 3;
    default:
      return 4;
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

type TaskRow = {
  id: string;
  url: string;
  title?: string;
  status: PackStatus;
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
};

function rowPercent(row: Pick<TaskRow, "current" | "total" | "status">): number {
  if (row.total > 0) return Math.min(100, Math.round((row.current / row.total) * 100));
  return row.status === "running" ? 30 : row.status === "failed" ? 0 : 100;
}

const TasksPage: React.FC = () => {
  const { tasks, packs, busy, history, processUrl, itemsForPack, settings, updateSettings } = useApp();
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

  const detectedUrls = useMemo(() => extractUrls(addText), [addText]);

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
      };
      draft.percent = rowPercent(draft);
      byId.set(p.id, draft);
    }

    for (const t of tasks) {
      const prev = byId.get(t.packId);
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
      };
      next.percent = rowPercent(next);
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

    return [...byId.values()];
  }, [tasks, packs, busy]);

  const rows = useMemo(() => {
    const list = [...baseRows];
    const field = (sorted.field as keyof TaskRow | undefined) ?? "updatedAt";
    const dir = sorted.direction === "ascend" ? 1 : -1;

    list.sort((a, b) => {
      // Keep running jobs pinned unless sorting by status explicitly
      if (field !== "status") {
        const aRun = a.status === "running" ? 1 : 0;
        const bRun = b.status === "running" ? 1 : 0;
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

  const openFolder = (row: TaskRow) => {
    const items = itemsForPack(row.id);
    const first = items[0] ?? history.find((h) => h.packId === row.id);
    if (first?.outPath) {
      void api.showItemInFolder(first.outPath);
      return;
    }
    if (settings?.outDir) void api.openPath(settings.outDir);
  };

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedKeys.includes(r.id) && r.id !== "pending"),
    [rows, selectedKeys]
  );

  const batchRetry = async () => {
    const urls = selectedRows
      .filter((r) => r.status !== "running" && r.url && r.url !== "…")
      .map((r) => r.url);
    for (const url of urls) {
      await processUrl(url);
    }
    setSelectedKeys([]);
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
    closeAddModal();
    void (async () => {
      for (const url of urls) {
        await processUrl(url, opts);
      }
    })();
  };

  const pickAddFolder = async () => {
    const dir = await api.pickFolder();
    if (!dir) return;
    setAddOutDir(dir);
    void updateSettings({ outDir: dir });
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
            <div className="text-13px font-500 text-t-primary truncate">
              {row.title?.trim() || row.url}
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
            animation={row.status === "running"}
          />
          <div className="text-11px text-t-secondary mt-2px tabular-nums">
            {row.status === "running"
              ? `${row.current}/${row.total}`
              : `${row.percent}% · ${row.current}/${row.total}`}
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
        const canOpen = row.files > 0 && row.status !== "running";
        const canRetry =
          row.status === "failed" || row.status === "partial" || row.status === "done";
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

  return (
    <div className="tasks-page flex flex-col flex-1 min-h-0 h-full w-full">
      <div className="shrink-0 mb-14px">
        <div className="flex items-center justify-between gap-16px mb-6px">
          <div className="text-22px font-600 text-t-primary">Tasks</div>
          <Space size={8} className="shrink-0">
            {selectedKeys.length > 0 && (
              <>
                <span className="text-13px text-t-secondary">{selectedKeys.length} selected</span>
                <Button
                  size="small"
                  type="outline"
                  icon={<Redo theme="outline" size="14" />}
                  disabled={selectedRows.every((r) => r.status === "running") || busy}
                  onClick={() => void batchRetry()}
                >
                  Retry selected
                </Button>
                <Button size="small" onClick={() => setSelectedKeys([])}>
                  Clear
                </Button>
              </>
            )}
            <Tooltip content="Add links">
              <Button
                type="primary"
                size="small"
                icon={<Plus theme="outline" size="14" />}
                disabled={busy}
                onClick={openAddModal}
                aria-label="Add links"
              />
            </Tooltip>
          </Space>
        </div>
        <div className="text-t-secondary text-14px">
          Download jobs for the tools service. Select rows for batch actions.
        </div>
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
          scroll={{ x: "100%", y: scrollY }}
          rowSelection={{
            type: "checkbox",
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys),
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
        okText={detectedUrls.length > 1 ? `Start download (${detectedUrls.length})` : "Start download"}
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
            <span className="text-12px text-t-tertiary">Autostart downloads</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TasksPage;

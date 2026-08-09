import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Progress, Space, Table, Tag, Tooltip, Typography } from "@arco-design/web-react";
import type { ColumnProps, SorterInfo } from "@arco-design/web-react/es/Table/interface";
import { FolderOpen, Redo } from "@icon-park/react";
import { useApp } from "@renderer/hooks/context/AppContext";
import { api, type PackStatus } from "@renderer/api";

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
  const { tasks, packs, busy, history, processUrl, itemsForPack, settings } = useApp();
  const cardRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(360);
  const [selectedKeys, setSelectedKeys] = useState<(string | number)[]>([]);
  const [sorted, setSorted] = useState<SorterInfo>({
    field: "updatedAt",
    direction: "descend",
  });

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
          <div className="text-13px font-500 text-t-primary truncate">
            {row.title || row.url}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {row.url}
          </Typography.Text>
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
      <div className="shrink-0 mb-14px flex items-end justify-between gap-16px">
        <div className="min-w-0">
          <div className="text-22px font-600 text-t-primary mb-6px">Tasks</div>
          <div className="text-t-secondary text-14px">
            Download jobs for the tools service. Select rows for batch actions.
          </div>
        </div>
        {selectedKeys.length > 0 && (
          <Space size={8} className="shrink-0">
            <span className="text-13px text-t-secondary">{selectedKeys.length} selected</span>
            <Button
              size="small"
              type="primary"
              icon={<Redo theme="outline" size="14" />}
              disabled={selectedRows.every((r) => r.status === "running")}
              onClick={() => void batchRetry()}
            >
              Retry selected
            </Button>
            <Button size="small" onClick={() => setSelectedKeys([])}>
              Clear
            </Button>
          </Space>
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
          noDataElement={<Empty description="No tasks yet. Paste a URL on Home to start." />}
        />
      </div>
    </div>
  );
};

export default TasksPage;

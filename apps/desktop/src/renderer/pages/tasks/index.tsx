import React from "react";
import { Button, Empty, Progress, Tag, Typography } from "@arco-design/web-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@renderer/hooks/context/AppContext";
import type { PackStatus } from "@renderer/api";

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

const TasksPage: React.FC = () => {
  const { tasks, packs, busy } = useApp();
  const navigate = useNavigate();

  const active = tasks.filter((t) => t.status === "running");
  const recent = tasks.filter((t) => t.status !== "running").slice(0, 12);
  const recentPacks = packs.filter((p) => p.status !== "running").slice(0, 12);

  return (
    <div className="max-w-720px">
      <div className="text-22px font-600 text-t-primary mb-6px">Tasks</div>
      <div className="text-t-secondary text-14px mb-24px">
        Live download progress and recent packs by URL.
      </div>

      <div className="text-13px font-600 text-t-primary mb-10px">In progress</div>
      {active.length === 0 && !busy ? (
        <div className="bg-2 border border-b-base rd-12px p-20px mb-24px">
          <Empty description="No active downloads. Paste a URL on Home to start." />
        </div>
      ) : (
        <div className="flex flex-col gap-10px mb-24px">
          {(active.length ? active : busy
            ? [
                {
                  packId: "pending",
                  url: "…",
                  current: 0,
                  total: 1,
                  status: "running" as const,
                  message: "Starting…",
                  updatedAt: Date.now(),
                },
              ]
            : []
          ).map((task) => (
            <div
              key={task.packId}
              className="bg-2 border border-b-base rd-12px px-16px py-14px flex flex-col gap-10px"
            >
              <div className="flex items-center justify-between gap-12px">
                <div className="min-w-0">
                  <div className="text-14px font-500 text-t-primary truncate">
                    {task.title || task.url}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                    {task.url}
                  </Typography.Text>
                </div>
                <Tag color={statusColor(task.status)} size="small">
                  {statusLabel(task.status)}
                </Tag>
              </div>
              <Progress
                percent={
                  task.total > 0
                    ? Math.min(100, Math.round((task.current / task.total) * 100))
                    : task.status === "running"
                      ? 30
                      : 100
                }
                status={task.status === "failed" ? "error" : undefined}
                animation={task.status === "running"}
              />
              <div className="text-12px text-t-tertiary">
                {task.message ||
                  (task.total > 0 ? `${task.current} / ${task.total}` : "Working…")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-10px">
        <div className="text-13px font-600 text-t-primary">Recent</div>
        <Button type="text" size="small" onClick={() => navigate("/gallery")}>
          Open gallery
        </Button>
      </div>

      {(recent.length === 0 && recentPacks.length === 0) ? (
        <Empty description="Finished tasks will appear here." />
      ) : (
        <div className="flex flex-col gap-10px">
          {(recent.length
            ? recent.map((t) => ({
                id: t.packId,
                url: t.url,
                title: t.title,
                status: t.status,
                message: t.message,
                updatedAt: t.updatedAt,
                files: t.current,
              }))
            : recentPacks.map((p) => ({
                id: p.id,
                url: p.url,
                title: p.title,
                status: p.status,
                message: `${p.itemIds.length} file(s)`,
                updatedAt: p.updatedAt,
                files: p.itemIds.length,
              }))
          ).map((row) => (
            <button
              key={row.id}
              type="button"
              className="bg-2 border border-b-base rd-12px px-16px py-14px flex items-center justify-between gap-12px text-left cursor-pointer hover:bg-hover"
              onClick={() => navigate("/gallery")}
            >
              <div className="min-w-0">
                <div className="text-14px font-500 text-t-primary truncate">
                  {row.title || row.url}
                </div>
                <div className="text-12px text-t-tertiary truncate mt-2px">{row.url}</div>
                <div className="text-12px text-t-tertiary mt-4px">
                  {row.message} · {new Date(row.updatedAt).toLocaleString()}
                </div>
              </div>
              <Tag color={statusColor(row.status)} size="small">
                {statusLabel(row.status)}
              </Tag>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TasksPage;

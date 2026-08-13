import React, { useMemo } from "react";
import { Button, Table, Tag } from "@arco-design/web-react";
import type { ColumnProps } from "@arco-design/web-react/es/Table/interface";
import AionModal from "@renderer/components/base/AionModal";
import type { MetaPagePostSummary, MetaPostInsight } from "@renderer/api";

function formatMetric(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function metric(
  post: MetaPagePostSummary,
  insight: MetaPostInsight | undefined,
  key: keyof NonNullable<MetaPostInsight["metrics"]>,
  fallback?: number
): number | undefined {
  return insight?.metrics?.[key] ?? fallback;
}

interface PostInsightsModalProps {
  open: boolean;
  posts: MetaPagePostSummary[];
  insights: Record<string, MetaPostInsight>;
  loading?: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

const PostInsightsModal: React.FC<PostInsightsModalProps> = ({
  open,
  posts,
  insights,
  loading = false,
  onClose,
  onRefresh,
}) => {
  const rows = useMemo(
    () =>
      posts.map((post) => ({
        post,
        insight: insights[post.id],
      })),
    [posts, insights]
  );

  const columns = useMemo<
    ColumnProps<{ post: MetaPagePostSummary; insight?: MetaPostInsight }>[]
  >(
    () => [
      {
        title: "Post",
        dataIndex: "post",
        width: 200,
        fixed: "left",
        ellipsis: true,
        render: (post: MetaPagePostSummary) => (
          <div className="min-w-0">
            <div className="text-13px text-t-primary truncate">
              {post.message?.trim() || "(No caption)"}
            </div>
            <div className="text-11px text-t-tertiary truncate">{post.id}</div>
          </div>
        ),
      },
      {
        title: "Views",
        width: 80,
        render: (_v, row) => (
          <span className="tabular-nums">
            {formatMetric(metric(row.post, row.insight, "impressions"))}
          </span>
        ),
      },
      {
        title: "Reach",
        width: 80,
        render: (_v, row) => (
          <span className="tabular-nums">{formatMetric(metric(row.post, row.insight, "reach"))}</span>
        ),
      },
      {
        title: "Reactions",
        width: 88,
        render: (_v, row) => (
          <span className="tabular-nums">
            {formatMetric(metric(row.post, row.insight, "reactions", row.post.reactionCount))}
          </span>
        ),
      },
      {
        title: "Comments",
        width: 88,
        render: (_v, row) => (
          <span className="tabular-nums">
            {formatMetric(metric(row.post, row.insight, "comments", row.post.commentCount))}
          </span>
        ),
      },
      {
        title: "Shares",
        width: 80,
        render: (_v, row) => (
          <span className="tabular-nums">
            {formatMetric(metric(row.post, row.insight, "shares", row.post.shareCount))}
          </span>
        ),
      },
      {
        title: "Engaged",
        width: 80,
        render: (_v, row) => (
          <span className="tabular-nums">{formatMetric(metric(row.post, row.insight, "engaged"))}</span>
        ),
      },
      {
        title: "Clicks",
        width: 72,
        render: (_v, row) => (
          <span className="tabular-nums">{formatMetric(metric(row.post, row.insight, "clicks"))}</span>
        ),
      },
      {
        title: "Video",
        width: 72,
        render: (_v, row) => (
          <span className="tabular-nums">
            {formatMetric(metric(row.post, row.insight, "videoViews"))}
          </span>
        ),
      },
      {
        title: "Status",
        width: 88,
        render: (_v, row) =>
          !row.insight ? (
            <Tag size="small" color="gray">
              Pending
            </Tag>
          ) : row.insight.ok ? (
            <Tag size="small" color="green">
              OK
            </Tag>
          ) : (
            <Tag size="small" color="orangered">
              N/A
            </Tag>
          ),
      },
      {
        title: "Note",
        dataIndex: "insight",
        width: 160,
        ellipsis: true,
        render: (insight?: MetaPostInsight) => (
          <span className="text-12px text-t-tertiary">{insight?.message ?? "—"}</span>
        ),
      },
    ],
    []
  );

  return (
    <AionModal
      visible={open}
      size="xlarge"
      onCancel={onClose}
      header={{
        title: "Post insights",
        subtitle: `${posts.length} post${posts.length === 1 ? "" : "s"}`,
      }}
      footer={{
        divider: true,
        render: () => (
          <div className="flex items-center justify-end gap-8px w-full">
            <Button onClick={onClose}>Close</Button>
            {onRefresh ? (
              <Button type="primary" loading={loading} onClick={onRefresh}>
                Refresh insights
              </Button>
            ) : null}
          </div>
        ),
      }}
    >
      <Table
        rowKey={(row) => row.post.id}
        columns={columns}
        data={rows}
        loading={loading}
        pagination={false}
        border={false}
        scroll={{ x: 1100, y: 420 }}
      />
    </AionModal>
  );
};

export default PostInsightsModal;

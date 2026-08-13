import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Empty,
  Image,
  Message,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "@arco-design/web-react";
import type { ColumnProps, SorterInfo } from "@arco-design/web-react/es/Table/interface";
import {
  Analysis,
  Close,
  Delete,
  LinkCloud,
  Message as MessageIcon,
  Pic,
  Plus,
  PreviewOpen,
  Refresh,
  Share,
  ThumbsUp,
  VideoOne,
} from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import { useResizableColumnWidths } from "@renderer/components/base/ResizableTableHeader";
import PostInsightsModal from "@renderer/components/publish/PostInsightsModal";
import SharePostsModal from "@renderer/components/publish/SharePostsModal";
import {
  api,
  type MetaPagePostSummary,
  type MetaPageSummary,
  type MetaPostInsight,
  type MetaPublishPublic,
} from "@renderer/api";
import facebookLogo from "@renderer/assets/provider-logos/facebook.svg";

const POSTS_COL = {
  no: 48,
  check: 44,
  media: 88,
  type: 112,
  caption: 240,
  postId: 168,
  engagement: 118,
  insights: 108,
  created: 128,
  status: 96,
  actions: 148,
} as const;

type PostsColKey = keyof typeof POSTS_COL;

const POSTS_PAGE_SIZE = 10;

const POSTS_COL_MIN: Record<PostsColKey, number> = {
  no: 40,
  check: 40,
  media: 88,
  type: 88,
  caption: 160,
  postId: 120,
  engagement: 96,
  insights: 96,
  created: 96,
  status: 72,
  actions: 120,
};

function formatWhen(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMetric(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function mergeEngagement(post: MetaPagePostSummary, insight?: MetaPostInsight) {
  const m = insight?.metrics;
  return {
    reactions: m?.reactions ?? post.reactionCount,
    comments: m?.comments ?? post.commentCount,
    shares: m?.shares ?? post.shareCount,
    impressions: m?.impressions,
    reach: m?.reach,
    engaged: m?.engaged,
    clicks: m?.clicks,
    videoViews: m?.videoViews,
  };
}

const PostStat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: number;
}> = ({ icon, label, value }) => (
  <Tooltip content={`${label}: ${formatMetric(value)}`}>
    <span className="posts-stat inline-flex items-center gap-3px tabular-nums">
      <span className="posts-stat__icon">{icon}</span>
      <span className="posts-stat__value">{formatMetric(value)}</span>
    </span>
  </Tooltip>
);

const PostEngagementCell: React.FC<{
  post: MetaPagePostSummary;
  insight?: MetaPostInsight;
}> = ({ post, insight }) => {
  const stats = mergeEngagement(post, insight);
  return (
    <div className="posts-stat-group">
      <PostStat icon={<ThumbsUp theme="outline" size="12" />} label="Reactions" value={stats.reactions} />
      <PostStat icon={<MessageIcon theme="outline" size="12" />} label="Comments" value={stats.comments} />
      <PostStat icon={<Share theme="outline" size="12" />} label="Shares" value={stats.shares} />
    </div>
  );
};

const PostInsightsCell: React.FC<{
  post: MetaPagePostSummary;
  insight?: MetaPostInsight;
}> = ({ post, insight }) => {
  const stats = mergeEngagement(post, insight);
  if (!insight) {
    return <span className="text-12px text-t-tertiary">Load insights</span>;
  }
  if (!insight.ok && stats.impressions == null && stats.reach == null) {
    return (
      <Tooltip content={insight.message ?? "Insight unavailable"}>
        <span className="text-12px text-t-tertiary">N/A</span>
      </Tooltip>
    );
  }
  return (
    <div className="posts-stat-group posts-stat-group--insights">
      <PostStat icon={<PreviewOpen theme="outline" size="12" />} label="Views" value={stats.impressions} />
      <PostStat icon={<Analysis theme="outline" size="12" />} label="Reach" value={stats.reach} />
      {stats.videoViews != null ? (
        <PostStat icon={<VideoOne theme="outline" size="12" />} label="Video views" value={stats.videoViews} />
      ) : (
        <PostStat icon={<LinkCloud theme="outline" size="12" />} label="Clicks" value={stats.clicks} />
      )}
    </div>
  );
};

function postKindLabel(post: MetaPagePostSummary): string {
  if (post.isCarousel) return "Carousel";
  const media = (post.mediaType ?? post.statusType ?? "").toLowerCase();
  if (media.includes("video")) return "Video";
  if (media.includes("photo") || media.includes("image")) return "Photo";
  if (post.pictureUrl) return "Media";
  return "Text";
}

function postKindColor(kind: string): string {
  if (kind === "Carousel") return "purple";
  if (kind === "Video") return "arcoblue";
  if (kind === "Photo") return "green";
  return "gray";
}

function postKindIcon(kind: string, size = 18): React.ReactNode {
  if (kind === "Carousel") return <Share theme="outline" size={size} />;
  if (kind === "Video") return <VideoOne theme="outline" size={size} />;
  if (kind === "Photo") return <Pic theme="outline" size={size} />;
  return <LinkCloud theme="outline" size={size} />;
}

const PostPreviewCell: React.FC<{ post: MetaPagePostSummary }> = ({ post }) => {
  const kind = postKindLabel(post);

  if (!post.pictureUrl) {
    return (
      <div className="posts-table__preview posts-table__preview--empty" aria-hidden>
        {postKindIcon(kind, 20)}
      </div>
    );
  }

  return (
    <div className="posts-table__preview">
      <Image
        className="posts-table__preview-image"
        width={72}
        height={72}
        src={post.pictureUrl}
        alt={post.message?.trim() || "Post preview"}
        preview
        previewProps={{
          src: post.pictureUrl,
          actions: post.permalinkUrl
            ? [
                {
                  key: "facebook",
                  content: <LinkCloud theme="outline" size="18" />,
                  name: "Open on Facebook",
                  onClick: () => void api.openExternal(post.permalinkUrl!),
                },
              ]
            : undefined,
        }}
        loader={
          <div className="posts-table__preview-loader flex-center">
            <Spin size={16} />
          </div>
        }
        error={
          <div className="posts-table__preview--empty flex-center">{postKindIcon(kind, 20)}</div>
        }
      />
      <span className="posts-table__preview-badge" aria-hidden>
        <PreviewOpen theme="outline" size="12" fill="currentColor" strokeWidth={3} />
      </span>
    </div>
  );
};

const PostsPage: React.FC = () => {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const tableScrollHideRef = useRef<number | null>(null);
  const [scrollY, setScrollY] = useState(360);

  const [config, setConfig] = useState<MetaPublishPublic | null>(null);
  const [pages, setPages] = useState<MetaPageSummary[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [posts, setPosts] = useState<MetaPagePostSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [insightsMap, setInsightsMap] = useState<Record<string, MetaPostInsight>>({});

  const [configLoading, setConfigLoading] = useState(true);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [selectingPage, setSelectingPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareModalPosts, setShareModalPosts] = useState<MetaPagePostSummary[]>([]);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sorted, setSorted] = useState<SorterInfo>({
    field: "createdTime",
    direction: "descend",
  });

  const {
    scrollX: tableScrollX,
    bindColumn: colResize,
    components: tableComponents,
  } = useResizableColumnWidths<MetaPagePostSummary>(POSTS_COL, POSTS_COL_MIN);

  const refreshConfig = useCallback(async () => {
    try {
      setConfig(await api.getMetaPublish());
    } catch {
      setConfig(null);
    }
  }, []);

  const loadPages = useCallback(async () => {
    setPagesLoading(true);
    try {
      const list = await api.listMetaPages();
      setPages(list);
      return list;
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
      setPages([]);
      return [];
    } finally {
      setPagesLoading(false);
    }
  }, []);

  const loadInsights = useCallback(async (postIds: string[], opts?: { silent?: boolean }) => {
    const ids = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return;
    setInsightsBusy(true);
    try {
      const rows = await api.getMetaPostInsights(ids);
      setInsightsMap((prev) => {
        const next = { ...prev };
        for (const row of rows) next[row.postId] = row;
        return next;
      });
      if (opts?.silent) return;
      const okCount = rows.filter((r) => r.ok).length;
      if (okCount === 0) {
        Message.warning(rows[0]?.message ?? "Could not load insights for these posts.");
      } else if (okCount < rows.length) {
        Message.info(`Loaded insights for ${okCount}/${rows.length} posts.`);
      } else {
        Message.success(`Loaded insights for ${okCount} post${okCount === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      if (!opts?.silent) Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setInsightsBusy(false);
    }
  }, []);

  const nextCursorRef = useRef<string | undefined>();
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  nextCursorRef.current = nextCursor;
  loadingRef.current = loading;
  loadingMoreRef.current = loadingMore;

  const loadPosts = useCallback(
    async (opts?: { append?: boolean; after?: string }) => {
      if (opts?.append) {
        if (loadingMoreRef.current || loadingRef.current || !nextCursorRef.current) return;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const result = await api.listMetaPagePosts({
          limit: POSTS_PAGE_SIZE,
          after: opts?.after,
        });
        setPosts((prev) => (opts?.append ? [...prev, ...result.posts] : result.posts));
        setNextCursor(result.nextCursor);
        if (!opts?.append) {
          setSelectedKeys([]);
          setInsightsMap({});
        }
        const loadedIds = result.posts.map((p) => p.id);
        if (loadedIds.length > 0) {
          void loadInsights(loadedIds, { silent: true });
        }
      } catch (err) {
        Message.error(err instanceof Error ? err.message : String(err));
        if (!opts?.append) setPosts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [loadInsights]
  );

  const loadMorePosts = useCallback(() => {
    const cursor = nextCursorRef.current;
    if (!cursor || loadingRef.current || loadingMoreRef.current) return;
    void loadPosts({ append: true, after: cursor });
  }, [loadPosts]);

  const refreshPosts = useCallback(() => {
    setNextCursor(undefined);
    void loadPosts();
  }, [loadPosts]);

  const openShareModal = useCallback((items: MetaPagePostSummary[]) => {
    if (items.length === 0) return;
    setShareModalPosts(items);
    setShareOpen(true);
  }, []);

  const deletePosts = useCallback(
    async (items: MetaPagePostSummary[]) => {
      if (items.length === 0) return;
      setDeleting(true);
      try {
        const result = await api.deleteMetaPagePosts(items.map((p) => p.id));
        const removed = new Set(result.results.filter((r) => r.ok).map((r) => r.postId));
        if (removed.size > 0) {
          setPosts((prev) => prev.filter((p) => !removed.has(p.id)));
          setSelectedKeys((prev) => prev.filter((id) => !removed.has(String(id))));
          setInsightsMap((prev) => {
            const next = { ...prev };
            for (const id of removed) delete next[id];
            return next;
          });
        }
        if (result.ok) Message.success(result.message);
        else Message.warning(result.message);
      } catch (err) {
        Message.error(err instanceof Error ? err.message : String(err));
      } finally {
        setDeleting(false);
      }
    },
    []
  );

  const confirmDeletePosts = useCallback(
    (items: MetaPagePostSummary[]) => {
      if (items.length === 0) return;
      Modal.confirm({
        title: items.length === 1 ? "Delete post?" : `Delete ${items.length} posts?`,
        content:
          items.length === 1
            ? "This removes the post from your Facebook Page. This can't be undone."
            : "This removes the selected posts from your Facebook Page. This can't be undone.",
        okText: "Delete",
        okButtonProps: { status: "danger" },
        onOk: () => deletePosts(items),
      });
    },
    [deletePosts]
  );

  const onPageChange = useCallback(
    async (pageId: string) => {
      setSelectedPageId(pageId);
      setPosts([]);
      setNextCursor(undefined);
      setSelectedKeys([]);
      setInsightsMap({});
      if (!pageId) return;

      setSelectingPage(true);
      try {
        const page = pages.find((p) => p.id === pageId);
        const next = await api.selectMetaPage({ pageId, pageName: page?.name });
        setConfig(next);
      } catch (err) {
        Message.error(err instanceof Error ? err.message : String(err));
        setSelectedPageId("");
      } finally {
        setSelectingPage(false);
      }
    },
    [pages]
  );

  useEffect(() => {
    void refreshConfig().finally(() => setConfigLoading(false));
  }, [refreshConfig]);

  useEffect(() => {
    if (!config?.connected) {
      setPages([]);
      setSelectedPageId("");
      return;
    }
    void loadPages();
  }, [config?.connected, loadPages]);

  useEffect(() => {
    if (!config?.pageId || selectedPageId) return;
    setSelectedPageId(config.pageId);
  }, [config?.pageId, selectedPageId]);

  useEffect(() => {
    if (!selectedPageId || !config?.hasPageToken || config?.pageId !== selectedPageId) return;
    void loadPosts();
  }, [selectedPageId, config?.hasPageToken, config?.pageId, loadPosts]);

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
  }, [selectedPageId, posts.length, selectedKeys.length]);

  const handleTableBodyScroll = useCallback(
    (target: HTMLElement) => {
      target.classList.add("is-scrolling");
      if (tableScrollHideRef.current) window.clearTimeout(tableScrollHideRef.current);
      tableScrollHideRef.current = window.setTimeout(() => {
        target.classList.remove("is-scrolling");
      }, 800);

      if (target.scrollTop + target.clientHeight >= target.scrollHeight - 80) {
        loadMorePosts();
      }
    },
    [loadMorePosts]
  );

  useEffect(() => {
    const root = cardRef.current;
    if (!root) return;
    let body: HTMLElement | null = null;

    const onScroll = () => {
      if (!body) return;
      handleTableBodyScroll(body);
    };

    const bind = () => {
      const next = root.querySelector(".arco-table-body") as HTMLElement | null;
      if (next === body) return;
      body?.removeEventListener("scroll", onScroll);
      body = next;
      body?.addEventListener("scroll", onScroll, { passive: true });
    };

    bind();
    const mo = new MutationObserver(bind);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      body?.removeEventListener("scroll", onScroll);
      if (tableScrollHideRef.current) window.clearTimeout(tableScrollHideRef.current);
    };
  }, [posts.length, loading, handleTableBodyScroll]);

  useEffect(() => {
    if (loading || loadingMore || !nextCursor || posts.length === 0) return;
    const body = cardRef.current?.querySelector(".arco-table-body") as HTMLElement | null;
    if (!body || body.scrollHeight > body.clientHeight + 4) return;
    loadMorePosts();
  }, [posts.length, loading, loadingMore, nextCursor, loadMorePosts, scrollY]);

  const pageOptions = useMemo(
    () => pages.map((p) => ({ label: p.name, value: p.id, extra: p.category })),
    [pages]
  );

  const selectedPageName = useMemo(() => {
    if (!selectedPageId) return undefined;
    return pages.find((p) => p.id === selectedPageId)?.name ?? config?.pageName;
  }, [selectedPageId, pages, config?.pageName]);

  const sortedPosts = useMemo(() => {
    const list = [...posts];
    const dir = sorted.direction === "ascend" ? 1 : -1;
    const field = sorted.field as string;
    list.sort((a, b) => {
      if (field === "createdTime") {
        const ta = a.createdTime ? new Date(a.createdTime).getTime() : 0;
        const tb = b.createdTime ? new Date(b.createdTime).getTime() : 0;
        return (ta - tb) * dir;
      }
      if (field === "message") {
        return (a.message ?? "").localeCompare(b.message ?? "") * dir;
      }
      if (field === "mediaType") {
        return postKindLabel(a).localeCompare(postKindLabel(b)) * dir;
      }
      return 0;
    });
    return list;
  }, [posts, sorted.direction, sorted.field]);

  const selectablePostIds = useMemo(() => sortedPosts.map((p) => p.id), [sortedPosts]);
  const allPostsSelected =
    selectablePostIds.length > 0 && selectablePostIds.every((id) => selectedKeys.includes(id));
  const somePostsSelected =
    !allPostsSelected && selectablePostIds.some((id) => selectedKeys.includes(id));

  const selectedPosts = useMemo(
    () => sortedPosts.filter((p) => selectedKeys.includes(p.id)),
    [sortedPosts, selectedKeys]
  );

  const toggleRowSelected = (id: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((k) => k !== id);
    });
  };

  const columns = useMemo<ColumnProps<MetaPagePostSummary>[]>(
    () => [
      {
        title: "No.",
        ...colResize("no"),
        align: "center",
        fixed: "left",
        className: "tasks-table__col-no",
        render: (_col, post) => {
          const n = sortedPosts.findIndex((p) => p.id === post.id) + 1;
          return <span className="tasks-table__index tabular-nums">{n > 0 ? n : "—"}</span>;
        },
      },
      {
        title: (
          <Checkbox
            checked={allPostsSelected}
            indeterminate={somePostsSelected}
            disabled={selectablePostIds.length === 0}
            onChange={(checked) => setSelectedKeys(checked ? [...selectablePostIds] : [])}
          />
        ),
        ...colResize("check"),
        align: "center",
        fixed: "left",
        className: "tasks-table__col-check",
        render: (_col, post) => (
          <Checkbox
            checked={selectedKeys.includes(post.id)}
            onChange={(checked) => toggleRowSelected(post.id, checked)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      {
        title: "Post",
        dataIndex: "pictureUrl",
        width: POSTS_COL.media,
        className: "tasks-table__col-media posts-table__col-preview",
        headerCellStyle: { padding: "10px 8px" },
        bodyCellStyle: { padding: "8px" },
        render: (_url, post) => <PostPreviewCell post={post} />,
      },
      {
        title: "Type",
        dataIndex: "mediaType",
        width: POSTS_COL.type,
        className: "posts-table__col-type",
        sorter: true,
        sortOrder: sorted.field === "mediaType" ? sorted.direction : undefined,
        ...colResize("type"),
        render: (_type, post) => {
          const kind = postKindLabel(post);
          return (
            <Tag size="small" color={postKindColor(kind)} className="posts-table__type-tag">
              {kind}
              {post.isCarousel && post.attachmentCount ? ` · ${post.attachmentCount}` : ""}
            </Tag>
          );
        },
      },
      {
        title: "Caption",
        dataIndex: "message",
        width: POSTS_COL.caption,
        className: "posts-table__col-caption",
        sorter: true,
        sortOrder: sorted.field === "message" ? sorted.direction : undefined,
        ellipsis: true,
        ...colResize("caption"),
        render: (message: string | undefined) => (
          <span className="tasks-table__task-title truncate text-13px text-t-primary">
            {message?.trim() || "(No caption)"}
          </span>
        ),
      },
      {
        title: "Post ID",
        dataIndex: "id",
        width: POSTS_COL.postId,
        className: "posts-table__col-post-id",
        ellipsis: true,
        ...colResize("postId"),
        render: (id: string) => (
          <Tooltip content={id}>
            <span className="text-12px text-t-secondary tabular-nums truncate block">{id}</span>
          </Tooltip>
        ),
      },
      {
        title: "Engagement",
        dataIndex: "reactionCount",
        width: POSTS_COL.engagement,
        className: "posts-table__col-engagement",
        ...colResize("engagement"),
        render: (_v, post) => (
          <PostEngagementCell post={post} insight={insightsMap[post.id]} />
        ),
      },
      {
        title: "Insights",
        dataIndex: "insights",
        width: POSTS_COL.insights,
        className: "posts-table__col-insights",
        ...colResize("insights"),
        render: (_v, post) => (
          <PostInsightsCell post={post} insight={insightsMap[post.id]} />
        ),
      },
      {
        title: "Created",
        dataIndex: "createdTime",
        width: POSTS_COL.created,
        className: "posts-table__col-created",
        sorter: true,
        sortOrder: sorted.field === "createdTime" ? sorted.direction : undefined,
        ...colResize("created"),
        render: (createdTime: string | undefined) => (
          <span className="text-12px text-t-secondary tabular-nums whitespace-nowrap">
            {formatWhen(createdTime)}
          </span>
        ),
      },
      {
        title: "Status",
        dataIndex: "isPublished",
        width: POSTS_COL.status,
        className: "posts-table__col-status",
        ...colResize("status"),
        render: (isPublished?: boolean) =>
          isPublished === false ? (
            <Tag size="small" color="orangered">
              Unpublished
            </Tag>
          ) : (
            <Tag size="small" color="green">
              Published
            </Tag>
          ),
      },
      {
        title: "Actions",
        dataIndex: "permalinkUrl",
        width: POSTS_COL.actions,
        align: "right",
        fixed: "right",
        className: "tasks-table__col-actions posts-table__col-actions",
        headerCellStyle: { padding: "10px 12px", textAlign: "right" },
        bodyCellStyle: { padding: "10px 12px", textAlign: "right" },
        ...colResize("actions"),
        render: (permalinkUrl: string | undefined, post) => (
          <div className="tasks-table__actions posts-table__actions">
            <Tooltip content="Load insights">
              <Button
                type="text"
                size="mini"
                loading={insightsBusy}
                icon={<Analysis theme="outline" size="14" />}
                onClick={() => void loadInsights([post.id])}
                aria-label="Load insights"
              />
            </Tooltip>
            <Tooltip content="Share to other Pages">
              <Button
                type="text"
                size="mini"
                icon={<Share theme="outline" size="14" />}
                disabled={!post.permalinkUrl}
                onClick={() => openShareModal([post])}
                aria-label="Share post"
              />
            </Tooltip>
            <Tooltip content="Delete post">
              <Button
                type="text"
                size="mini"
                status="danger"
                loading={deleting}
                icon={<Delete theme="outline" size="14" />}
                onClick={() => confirmDeletePosts([post])}
                aria-label="Delete post"
              />
            </Tooltip>
            {permalinkUrl ? (
              <Tooltip content="View on Facebook">
                <Button
                  type="text"
                  size="mini"
                  icon={<LinkCloud theme="outline" size="14" />}
                  onClick={() => void api.openExternal(permalinkUrl)}
                  aria-label="View on Facebook"
                />
              </Tooltip>
            ) : null}
          </div>
        ),
      },
    ],
    [
      allPostsSelected,
      colResize,
      confirmDeletePosts,
      deleting,
      insightsBusy,
      insightsMap,
      loadInsights,
      openShareModal,
      selectablePostIds,
      selectedKeys,
      somePostsSelected,
      sorted.field,
      sorted.direction,
      sortedPosts,
    ]
  );

  const openSettings = () => {
    void navigate("/settings/publishing");
  };

  const tableEmpty = !selectedPageId ? (
    <Empty description="Select a Facebook Page to load posts" />
  ) : (
    <Empty description="No posts found on this Page" />
  );

  const tableBusy = loading || selectingPage;

  const onRow = (record: MetaPagePostSummary) => ({
    className: selectedKeys.includes(record.id) ? "tasks-row-selected" : undefined,
  });

  return (
    <div className="tasks-page posts-page flex flex-col flex-1 min-h-0 h-full w-full">
      <div className="shrink-0 mb-14px">
        <div className="flex items-center justify-between gap-16px mb-6px flex-wrap">
          <div className="flex items-center gap-12px min-w-0">
            <img src={facebookLogo} alt="" className="remote-channel-logo shrink-0" draggable={false} />
            <div className="text-22px font-600 text-t-primary">Page posts</div>
          </div>
          <Space size={8} className="tasks-header-actions shrink-0 flex-wrap justify-end">
            {selectedKeys.length > 0 ? (
              <>
                <span className="tasks-header-selected text-13px text-t-secondary tabular-nums">
                  {selectedKeys.length}
                  <span className="tasks-header-btn__label"> selected</span>
                </span>
                <Tooltip content="Load views, reach, engagement for selected posts">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    icon={<Analysis theme="outline" size="14" />}
                    loading={insightsBusy}
                    onClick={() => void loadInsights(selectedKeys)}
                  >
                    <span className="tasks-header-btn__label">Insights</span>
                  </Button>
                </Tooltip>
                <Tooltip content="Share selected posts to other Pages">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    icon={<Share theme="outline" size="14" />}
                    disabled={selectedPosts.every((p) => !p.permalinkUrl)}
                    onClick={() => openShareModal(selectedPosts)}
                  >
                    <span className="tasks-header-btn__label">Share</span>
                  </Button>
                </Tooltip>
                <Tooltip content="Delete selected posts from this Page">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    status="danger"
                    icon={<Delete theme="outline" size="14" />}
                    loading={deleting}
                    onClick={() => confirmDeletePosts(selectedPosts)}
                  >
                    <span className="tasks-header-btn__label">Delete</span>
                  </Button>
                </Tooltip>
                <Tooltip content="Open insights table for selected posts">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    onClick={() => setInsightsOpen(true)}
                  >
                    <span className="tasks-header-btn__label">Details</span>
                  </Button>
                </Tooltip>
                <Tooltip content="Clear selection">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    icon={<Close theme="outline" size="14" />}
                    onClick={() => setSelectedKeys([])}
                  >
                    <span className="tasks-header-btn__label">Deselect</span>
                  </Button>
                </Tooltip>
              </>
            ) : config?.connected ? (
              <>
                <Select
                  className="posts-page__page-select"
                  placeholder="Select a Page…"
                  size="small"
                  loading={pagesLoading || selectingPage}
                  value={selectedPageId || undefined}
                  options={pageOptions}
                  showSearch
                  allowClear
                  filterOption={(input, option) => {
                    const page = pages.find((p) => p.id === option.props.value);
                    return (page?.name ?? "").toLowerCase().includes(input.toLowerCase());
                  }}
                  onChange={(v) => void onPageChange(v ? String(v) : "")}
                  triggerProps={{ autoAlignPopupWidth: false, position: "bl" }}
                />
                <Tooltip content="Reload posts from Meta">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    icon={<Refresh theme="outline" size="14" />}
                    loading={loading}
                    disabled={!selectedPageId}
                    onClick={() => void refreshPosts()}
                    aria-label="Refresh posts"
                  >
                    <span className="tasks-header-btn__label">Refresh</span>
                  </Button>
                </Tooltip>
                <span className="tasks-header-sep" aria-hidden />
                <Tooltip content="Create a new post">
                  <Button
                    className="tasks-header-btn"
                    size="small"
                    type="outline"
                    icon={<Plus theme="outline" size="14" />}
                    onClick={() => void navigate("/publish")}
                    aria-label="Create post"
                  >
                    <span className="tasks-header-btn__label">Create</span>
                  </Button>
                </Tooltip>
              </>
            ) : (
              <Button type="primary" size="small" onClick={openSettings}>
                Connect Publishing
              </Button>
            )}
          </Space>
        </div>
        <div className="text-13px text-t-secondary min-w-0">
          {configLoading ? (
            "Loading…"
          ) : !config?.connected ? (
            "Connect a Facebook account in Publishing settings to browse Page posts."
          ) : selectedPageName ? (
            <>
              Showing posts for{" "}
              <span className="text-t-primary font-500">{selectedPageName}</span>
              {posts.length > 0 ? (
                <>
                  {" "}
                  · <span className="tabular-nums">{posts.length}</span> loaded
                  {nextCursor ? " · scroll for more" : ""}
                </>
              ) : tableBusy ? (
                " · loading…"
              ) : null}
            </>
          ) : (
            "Choose a Facebook Page to load posts from the Meta Graph API."
          )}
        </div>
      </div>

      <div className="tasks-table-card flex-1 min-h-0 w-full" ref={cardRef}>
        {configLoading ? (
          <div className="flex justify-center items-center h-full">
            <Spin />
          </div>
        ) : !config?.connected ? (
          <div className="flex flex-col justify-center items-center h-full gap-12px">
            <Empty description="Connect a Facebook account in Publishing settings" />
            <Button type="primary" size="small" onClick={openSettings}>
              Open Publishing settings
            </Button>
          </div>
        ) : (
          <Table
            className="tasks-table tasks-table--resizable posts-table"
            rowKey="id"
            columns={columns}
            data={sortedPosts}
            components={tableComponents}
            loading={tableBusy}
            pagination={false}
            border={false}
            hover
            scroll={{ x: tableScrollX, y: scrollY }}
            noDataElement={tableEmpty}
            onRow={onRow}
            footer={
              loadingMore
                ? () => (
                    <div className="posts-table-infinite-footer">
                      <Spin size={16} />
                      <span>Loading more posts…</span>
                    </div>
                  )
                : undefined
            }
            onChange={(_pagination, sorter) => {
              const next = Array.isArray(sorter) ? sorter[0] : sorter;
              if (!next?.direction) {
                setSorted({ field: "createdTime", direction: "descend" });
                return;
              }
              setSorted({
                field: (next.field as string) || "createdTime",
                direction: next.direction,
              });
            }}
          />
        )}
      </div>

      <SharePostsModal
        open={shareOpen}
        posts={shareModalPosts}
        pages={pages}
        sourcePageId={selectedPageId}
        onClose={() => {
          setShareOpen(false);
          setShareModalPosts([]);
        }}
      />

      <PostInsightsModal
        open={insightsOpen}
        posts={selectedPosts}
        insights={insightsMap}
        loading={insightsBusy}
        onClose={() => setInsightsOpen(false)}
        onRefresh={() => void loadInsights(selectedPosts.map((p) => p.id))}
      />
    </div>
  );
};

export default PostsPage;

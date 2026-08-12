import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Message, Select, Spin, Table, Tag } from "@arco-design/web-react";
import type { ColumnProps } from "@arco-design/web-react/es/Table/interface";
import { LinkCloud, Pic, Refresh, Share, VideoOne } from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type MetaPagePostSummary,
  type MetaPageSummary,
  type MetaPublishPublic,
} from "@renderer/api";
import facebookLogo from "@renderer/assets/provider-logos/facebook.svg";

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

function postKindIcon(kind: string): React.ReactNode {
  const size = 14;
  if (kind === "Carousel") return <Share theme="outline" size={size} />;
  if (kind === "Video") return <VideoOne theme="outline" size={size} />;
  if (kind === "Photo") return <Pic theme="outline" size={size} />;
  return <LinkCloud theme="outline" size={size} />;
}

const PostsPage: React.FC = () => {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);

  const [config, setConfig] = useState<MetaPublishPublic | null>(null);
  const [pages, setPages] = useState<MetaPageSummary[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [posts, setPosts] = useState<MetaPagePostSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  const [configLoading, setConfigLoading] = useState(true);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [selectingPage, setSelectingPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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

  const loadPosts = useCallback(async (opts?: { append?: boolean; after?: string }) => {
    if (opts?.append) setLoadingMore(true);
    else setLoading(true);
    try {
      const page = await api.listMetaPagePosts({
        limit: 25,
        after: opts?.after,
      });
      setPosts((prev) => (opts?.append ? [...prev, ...page.posts] : page.posts));
      setNextCursor(page.nextCursor);
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
      if (!opts?.append) setPosts([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const onPageChange = useCallback(
    async (pageId: string) => {
      setSelectedPageId(pageId);
      setPosts([]);
      setNextCursor(undefined);
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
    if (!selectedPageId || !config?.hasPageToken || config.pageId !== selectedPageId) return;
    void loadPosts();
  }, [selectedPageId, config?.hasPageToken, config?.pageId, loadPosts]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const update = () => setScrollY(Math.max(160, el.clientHeight - 44));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedPageId, posts.length]);

  const pageOptions = useMemo(
    () => pages.map((p) => ({ label: p.name, value: p.id, extra: p.category })),
    [pages]
  );

  const selectedPageName = useMemo(() => {
    if (!selectedPageId) return undefined;
    return pages.find((p) => p.id === selectedPageId)?.name ?? config?.pageName;
  }, [selectedPageId, pages, config?.pageName]);

  const columns = useMemo<ColumnProps<MetaPagePostSummary>[]>(
    () => [
      {
        title: "Preview",
        dataIndex: "pictureUrl",
        width: 88,
        render: (_url, post) => {
          const kind = postKindLabel(post);
          return post.pictureUrl ? (
            <img src={post.pictureUrl} alt="" className="posts-table__thumb" />
          ) : (
            <div className="posts-table__thumb posts-table__thumb--empty flex-center text-t-tertiary">
              {postKindIcon(kind)}
            </div>
          );
        },
      },
      {
        title: "Type",
        dataIndex: "mediaType",
        width: 120,
        render: (_type, post) => {
          const kind = postKindLabel(post);
          return (
            <Tag size="small" color={postKindColor(kind)} icon={postKindIcon(kind)}>
              {kind}
              {post.isCarousel && post.attachmentCount ? ` · ${post.attachmentCount}` : ""}
            </Tag>
          );
        },
      },
      {
        title: "Caption",
        dataIndex: "message",
        ellipsis: true,
        render: (message: string | undefined) => (
          <span className="text-13px text-t-primary">{message?.trim() || "(No caption)"}</span>
        ),
      },
      {
        title: "Created",
        dataIndex: "createdTime",
        width: 168,
        render: (createdTime: string | undefined) => (
          <span className="text-12px text-t-secondary tabular-nums">{formatWhen(createdTime)}</span>
        ),
      },
      {
        title: "Status",
        dataIndex: "isPublished",
        width: 108,
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
        title: "",
        dataIndex: "permalinkUrl",
        width: 132,
        fixed: "right",
        render: (permalinkUrl: string | undefined) =>
          permalinkUrl ? (
            <Button size="mini" type="text" onClick={() => void api.openExternal(permalinkUrl)}>
              View on Facebook
            </Button>
          ) : (
            <span className="text-12px text-t-tertiary">—</span>
          ),
      },
    ],
    []
  );

  const openSettings = () => {
    void navigate("/settings/publishing");
  };

  const tableEmpty = !selectedPageId ? (
    <Empty description="Select a Facebook Page above to load posts" />
  ) : (
    <Empty description="No posts found on this Page" />
  );

  return (
    <div className="posts-page flex flex-col flex-1 min-h-0 h-full w-full">
      <div className="shrink-0 mb-16px flex items-start justify-between gap-16px flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-10px mb-6px">
            <img src={facebookLogo} alt="" className="remote-channel-logo" draggable={false} />
            <h1 className="text-22px font-600 text-t-primary m-0">Page posts</h1>
          </div>
          <p className="text-13px text-t-secondary m-0 max-w-640px">
            {config?.connected
              ? "Choose a Facebook Page, then browse its posts from the Meta Graph API."
              : "Connect Publishing in Settings before loading Page posts."}
          </p>
        </div>
        <div className="flex items-center gap-8px shrink-0 flex-wrap">
          {config?.connected ? (
            <>
              <Select
                className="posts-page__page-select"
                placeholder="Select a Page…"
                loading={pagesLoading || selectingPage}
                value={selectedPageId || undefined}
                options={pageOptions}
                showSearch
                filterOption={(input, option) => {
                  const page = pages.find((p) => p.id === option.props.value);
                  return (page?.name ?? "").toLowerCase().includes(input.toLowerCase());
                }}
                onChange={(v) => void onPageChange(String(v))}
                triggerProps={{ autoAlignPopupWidth: false, position: "bl" }}
              />
              <Button
                icon={<Refresh theme="outline" size="14" />}
                loading={loading}
                disabled={!selectedPageId}
                onClick={() => void loadPosts()}
              >
                Refresh
              </Button>
            </>
          ) : (
            <Button type="primary" onClick={openSettings}>
              Open Publishing settings
            </Button>
          )}
        </div>
      </div>

      {selectedPageName ? (
        <p className="shrink-0 text-12px text-t-tertiary m-0 mb-10px">
          Showing posts for <span className="text-t-secondary font-500">{selectedPageName}</span>
        </p>
      ) : null}

      <div className="posts-table-card flex-1 min-h-0 w-full" ref={cardRef}>
        {configLoading ? (
          <div className="flex justify-center items-center h-full">
            <Spin />
          </div>
        ) : !config?.connected ? (
          <div className="flex justify-center items-center h-full">
            <Empty description="Connect a Facebook account in Publishing settings" />
          </div>
        ) : (
          <Table
            className="posts-table"
            rowKey="id"
            columns={columns}
            data={posts}
            loading={loading || selectingPage}
            pagination={false}
            border={false}
            hover
            scroll={{ x: 920, y: scrollY }}
            noDataElement={tableEmpty}
          />
        )}
      </div>

      {selectedPageId && nextCursor ? (
        <div className="shrink-0 flex justify-center pt-10px">
          <Button loading={loadingMore} onClick={() => void loadPosts({ append: true, after: nextCursor })}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default PostsPage;

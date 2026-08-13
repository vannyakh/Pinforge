import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Message, Radio, Select, Spin, Tooltip } from "@arco-design/web-react";
import { Info, LinkCloud, Pic, Right, Share, VideoOne } from "@icon-park/react";
import type { MetaClonePostMode, MetaPagePostSummary, MetaPageSummary } from "@common/publish/types";
import {
  CLONE_MODE_OPTIONS,
  clonePostKindLabel,
  draftFromCloneDetail,
  formatClonePostDate,
} from "@renderer/components/publish/clonePagePost";
import { useMetaPublishStore } from "@renderer/pages/publish/metaPublishStore";
import type { MetaPublishPublic } from "@renderer/api";
import { api } from "@renderer/api";

const POST_LIMIT_OPTIONS = [5, 10, 15, 25];

type ClonePagePostPanelProps = {
  config: MetaPublishPublic | null;
  onOpenSettings: () => void;
  onCloned: () => void;
};

function postKindIcon(kind: string, size = 18): React.ReactNode {
  if (kind.startsWith("Carousel")) return <Share theme="outline" size={size} fill="currentColor" />;
  if (kind === "Video") return <VideoOne theme="outline" size={size} fill="currentColor" />;
  if (kind === "Photo") return <Pic theme="outline" size={size} fill="currentColor" />;
  return <LinkCloud theme="outline" size={size} fill="currentColor" />;
}

const ClonePostRow: React.FC<{
  post: MetaPagePostSummary;
  busy: boolean;
  onSelect: (post: MetaPagePostSummary) => void;
}> = ({ post, busy, onSelect }) => {
  const kind = clonePostKindLabel(post);
  const preview = post.message?.trim() || "(No caption)";

  return (
    <button
      type="button"
      className="clone-post-row"
      disabled={busy}
      onClick={() => onSelect(post)}
    >
      <span className="clone-post-row__preview" aria-hidden>
        {post.pictureUrl ? (
          <img className="clone-post-row__image" src={post.pictureUrl} alt="" loading="lazy" />
        ) : (
          <span className="clone-post-row__placeholder">{postKindIcon(kind, 20)}</span>
        )}
      </span>
      <span className="clone-post-row__content">
        <span className="clone-post-row__meta">
          <span className="clone-post-row__kind">{kind}</span>
          {post.createdTime ? (
            <span className="clone-post-row__date">{formatClonePostDate(post.createdTime)}</span>
          ) : null}
        </span>
        <span className="clone-post-row__caption">{preview}</span>
      </span>
      {busy ? (
        <Spin size={16} className="clone-post-row__chevron" />
      ) : (
        <Right theme="outline" size="16" fill="currentColor" className="clone-post-row__chevron" />
      )}
    </button>
  );
};

const ClonePagePostPanel: React.FC<ClonePagePostPanelProps> = ({
  config,
  onOpenSettings,
  onCloned,
}) => {
  const initDraft = useMetaPublishStore((s) => s.initDraft);

  const [pageUrl, setPageUrl] = useState("");
  const [postLimit, setPostLimit] = useState(10);
  const [cloneMode, setCloneMode] = useState<MetaClonePostMode>("all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cloningPostId, setCloningPostId] = useState<string | null>(null);
  const [posts, setPosts] = useState<MetaPagePostSummary[]>([]);
  const [page, setPage] = useState<MetaPageSummary | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  const nextCursorRef = useRef<string | undefined>();
  nextCursorRef.current = nextCursor;

  useEffect(() => {
    if (!config) return;
    setPageUrl(config.clonePageUrl ?? "");
    setPostLimit(config.clonePostLimit ?? 10);
    setCloneMode(config.clonePostMode ?? "all");
  }, [config]);

  const persistConfig = useCallback(
    async (url: string, limit: number, mode: MetaClonePostMode) => {
      try {
        await api.setMetaCloneConfig({ clonePageUrl: url, clonePostLimit: limit, clonePostMode: mode });
      } catch {
        /* non-fatal */
      }
    },
    []
  );

  const loadPosts = useCallback(
    async (opts?: { append?: boolean; after?: string }) => {
      const url = pageUrl.trim();
      if (!url) {
        Message.warning("Enter a Facebook Page URL first.");
        return;
      }
      if (!config?.connected) {
        Message.warning("Connect Facebook in Publishing settings first.");
        return;
      }

      if (opts?.append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        await persistConfig(url, postLimit, cloneMode);
        const result = await api.listMetaPagePostsFromUrl({
          pageUrl: url,
          limit: postLimit,
          after: opts?.after,
          mode: cloneMode,
        });
        setPage(result.page);
        setPosts((prev) => (opts?.append ? [...prev, ...result.posts] : result.posts));
        setNextCursor(result.nextCursor);
        if (!opts?.append && result.posts.length === 0) {
          Message.info(
            cloneMode === "carousel"
              ? "No carousel posts found for this Page."
              : cloneMode === "single"
                ? "No single posts found for this Page."
                : "No posts found for this Page."
          );
        }
      } catch (err) {
        Message.error(err instanceof Error ? err.message : String(err));
        if (!opts?.append) {
          setPosts([]);
          setPage(null);
          setNextCursor(undefined);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cloneMode, config?.connected, pageUrl, persistConfig, postLimit]
  );

  const loadMore = () => {
    const cursor = nextCursorRef.current;
    if (!cursor || loading || loadingMore) return;
    void loadPosts({ append: true, after: cursor });
  };

  const onModeChange = (mode: MetaClonePostMode) => {
    setCloneMode(mode);
    setPosts([]);
    setNextCursor(undefined);
    void persistConfig(pageUrl.trim(), postLimit, mode);
  };

  const onSelectPost = async (post: MetaPagePostSummary) => {
    if (!page?.id || cloningPostId) return;
    setCloningPostId(post.id);
    try {
      const detail = await api.getMetaPagePostCloneDetail({
        postId: post.id,
        sourcePageId: page.id,
      });
      initDraft(
        draftFromCloneDetail(detail, page ? `Cloned from ${page.name}` : "Cloned from Page")
      );
      Message.success(
        detail.postType === "video_carousel"
          ? "Carousel content imported. Review cards before publishing."
          : "Post content imported."
      );
      onCloned();
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCloningPostId(null);
    }
  };

  if (!config?.connected) {
    return (
      <div className="clone-page-panel">
        <p className="clone-page-panel__hint text-13px text-t-secondary">
          Connect your Meta Developer App and Facebook account to load posts from Pages you manage.
        </p>
        <Button type="primary" size="small" onClick={onOpenSettings}>
          Publishing settings
        </Button>
      </div>
    );
  }

  return (
    <div className="clone-page-panel">
      <div className="clone-page-panel__form">
        <div className="clone-page-panel__field">
          <label className="clone-page-panel__label" htmlFor="clone-page-url">
            <span className="inline-flex items-center gap-6px">
              Facebook Page URL
              <Tooltip content="Must be a Page your Facebook account manages (role + pages_read_engagement).">
                <span className="remote-label-help" tabIndex={0} aria-label="Help">
                  <Info theme="outline" size="14" fill="currentColor" />
                </span>
              </Tooltip>
            </span>
          </label>
          <Input
            id="clone-page-url"
            value={pageUrl}
            placeholder="https://www.facebook.com/PageName"
            allowClear
            onChange={setPageUrl}
            onPressEnter={() => void loadPosts()}
          />
        </div>
        <div className="clone-page-panel__field clone-page-panel__field--limit">
          <label className="clone-page-panel__label" htmlFor="clone-post-limit">
            Posts to load
          </label>
          <Select
            id="clone-post-limit"
            value={postLimit}
            options={POST_LIMIT_OPTIONS.map((n) => ({ label: String(n), value: n }))}
            onChange={(v) => setPostLimit(Number(v) || 10)}
          />
        </div>
        <Button type="primary" loading={loading} onClick={() => void loadPosts()}>
          Load posts
        </Button>
      </div>

      <div className="clone-page-panel__mode">
        <span className="clone-page-panel__label">Post type</span>
        <Radio.Group
          type="button"
          value={cloneMode}
          options={CLONE_MODE_OPTIONS}
          onChange={onModeChange}
        />
      </div>

      {page ? (
        <p className="clone-page-panel__source text-13px text-t-secondary">
          Showing {cloneMode === "all" ? "all" : cloneMode} posts from <strong>{page.name}</strong>
        </p>
      ) : null}

      {loading ? (
        <div className="clone-page-panel__loading flex-center py-24px">
          <Spin />
        </div>
      ) : posts.length > 0 ? (
        <div className="clone-post-list" role="list">
          {posts.map((post) => (
            <ClonePostRow
              key={post.id}
              post={post}
              busy={cloningPostId === post.id}
              onSelect={(p) => void onSelectPost(p)}
            />
          ))}
        </div>
      ) : null}

      {nextCursor && posts.length > 0 ? (
        <div className="clone-page-panel__more pt-8px">
          <Button type="outline" size="small" loading={loadingMore} onClick={loadMore}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default ClonePagePostPanel;

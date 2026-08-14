import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Empty, Message, Spin } from "@arco-design/web-react";
import { CheckOne, CloseOne, Link as LinkIcon, Time } from "@icon-park/react";
import type { Dayjs } from "dayjs";
import PublishSchedulePicker from "@renderer/components/publish/PublishSchedulePicker";
import type { PublishScheduleMode } from "@renderer/components/publish/publishSchedule";
import {
  buildPublishTiming,
  defaultScheduleDayjs,
  isScheduleTimeValid,
  META_MIN_SCHEDULE_LEAD_MS,
  scheduleDayjsToUnixSec,
} from "@renderer/components/publish/publishSchedule";
import { api, type MetaPageSummary, type MetaPageVideoSummary, type MetaPublishTiming } from "@renderer/api";
import {
  META_POST_TYPE_LABELS,
  isPublishDraftReady,
  peCarouselSlidesForPublish,
  photoCarouselSlidesForPublish,
  useMetaPublishStore,
} from "@renderer/pages/publish/metaPublishStore";
import { buildPublishMessage } from "@renderer/components/publish/publishComposeMessage";

type PagePipelineState = "pending" | "running" | "success" | "error";

type PagePipelineStatus = {
  state: PagePipelineState;
  message: string;
  postId?: string;
};

type MetaPublishPagePickerProps = {
  cancelLabel?: string;
  onCancel: () => void;
  onPublished?: () => void;
};

function facebookPostUrl(pageId: string, postId?: string): string | undefined {
  const trimmed = postId?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes("_")) return `https://www.facebook.com/${trimmed}`;
  const page = pageId.trim();
  return page ? `https://www.facebook.com/${page}_${trimmed}` : undefined;
}

function formatPipelinePostId(postId?: string): string | undefined {
  const trimmed = postId?.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes("_")) {
    const segment = trimmed.split("_").pop();
    return segment && segment.length > 8 ? `…${segment.slice(-8)}` : segment;
  }
  return trimmed.length > 12 ? `…${trimmed.slice(-10)}` : trimmed;
}

function successPipelineMessage(doneLabel: string, postId?: string): string {
  const shortId = formatPipelinePostId(postId);
  return shortId ? `${doneLabel} · ${shortId}` : doneLabel;
}

function pipelineRowClass(state?: PagePipelineState): string {
  if (state === "pending") return "is-pending";
  if (state === "running") return "is-running";
  if (state === "success") return "is-success";
  if (state === "error") return "is-error";
  return "";
}

const PageAvatar: React.FC<{ page: MetaPageSummary }> = ({ page }) => {
  const [failed, setFailed] = useState(false);
  const initial = page.name.trim().charAt(0).toUpperCase() || "P";
  const src = page.pictureUrl?.trim();

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      <img
        className="publish-page-picker__avatar publish-page-picker__avatar--img"
        src={src}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="publish-page-picker__avatar" aria-hidden>
      {initial}
    </span>
  );
};

const MetaPublishPagePicker: React.FC<MetaPublishPagePickerProps> = ({
  cancelLabel = "Cancel",
  onCancel,
  onPublished,
}) => {
  const postType = useMetaPublishStore((s) => s.postType);
  const message = useMetaPublishStore((s) => s.message);
  const hashtags = useMetaPublishStore((s) => s.hashtags);
  const filePath = useMetaPublishStore((s) => s.filePath);
  const videoThumbnailPath = useMetaPublishStore((s) => s.videoThumbnailPath);
  const photoPostMode = useMetaPublishStore((s) => s.photoPostMode);
  const photoAlbumPaths = useMetaPublishStore((s) => s.photoAlbumPaths);
  const photoAlbumDestination = useMetaPublishStore((s) => s.photoAlbumDestination);
  const photoAlbumFacebookId = useMetaPublishStore((s) => s.photoAlbumFacebookId);
  const photoAlbumNewName = useMetaPublishStore((s) => s.photoAlbumNewName);
  const photoCarouselSlides = useMetaPublishStore((s) => s.photoCarouselSlides);
  const carouselSlides = useMetaPublishStore((s) => s.carouselSlides);
  const carouselCtaOption = useMetaPublishStore((s) => s.carouselCtaOption);
  const carouselCreatingAdIds = useMetaPublishStore((s) => s.carouselCreatingAdIds);
  const carouselGeneratingThumbIds = useMetaPublishStore((s) => s.carouselGeneratingThumbIds);
  const link = useMetaPublishStore((s) => s.link);
  const sourceLabel = useMetaPublishStore((s) => s.sourceLabel);
  const closePublish = useMetaPublishStore((s) => s.closePublish);
  const config = useMetaPublishStore((s) => s.config);
  const pages = useMetaPublishStore((s) => s.pages);
  const loadingPages = useMetaPublishStore((s) => s.loadingPages);
  const selectedPageIds = useMetaPublishStore((s) => s.selectedPageIds);
  const loadPages = useMetaPublishStore((s) => s.loadPages);
  const togglePage = useMetaPublishStore((s) => s.togglePage);
  const selectAllPages = useMetaPublishStore((s) => s.selectAllPages);

  const [publishing, setPublishing] = useState(false);
  const [publishComplete, setPublishComplete] = useState(false);
  const [pagePipeline, setPagePipeline] = useState<Record<string, PagePipelineStatus>>({});
  const [publishMode, setPublishMode] = useState<PublishScheduleMode>("now");
  const [scheduleValue, setScheduleValue] = useState<Dayjs | undefined>(() =>
    defaultScheduleDayjs(META_MIN_SCHEDULE_LEAD_MS)
  );
  const [pageVideos, setPageVideos] = useState<MetaPageVideoSummary[]>([]);
  const [pagesLoadError, setPagesLoadError] = useState<string | null>(null);

  useEffect(() => {
    setPublishMode("now");
    setScheduleValue(defaultScheduleDayjs(META_MIN_SCHEDULE_LEAD_MS));
    setPagePipeline({});
    setPublishComplete(false);
    setPagesLoadError(null);
  }, []);

  useEffect(() => {
    if (loadingPages || pages.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadPages();
        if (!cancelled) setPagesLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setPagesLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPages, loadingPages, pages.length]);

  useEffect(() => {
    if (postType !== "video_carousel") return;
    let alive = true;
    void api.listMetaPageVideos(30).then((videos) => {
      if (alive) setPageVideos(videos);
    });
    return () => {
      alive = false;
    };
  }, [postType]);

  const publishVerb = publishMode === "schedule" ? "Scheduling" : "Posting";
  const publishDoneLabel = publishMode === "schedule" ? "Scheduled" : "Published";

  const isCarousel = postType === "video_carousel";
  const isPhotoCarousel = postType === "photo" && photoPostMode === "carousel";
  const needsSingleFile =
    postType === "video" || (postType === "photo" && photoPostMode === "single");

  const contentReady = useMemo(
    () =>
      isPublishDraftReady({
        postType,
        message,
        hashtags,
        filePath,
        link,
        photoPostMode,
        photoAlbumPaths,
        photoAlbumDestination,
        photoAlbumFacebookId,
        photoAlbumNewName,
        photoCarouselSlides,
        carouselSlides,
        pageVideos: postType === "video_carousel" ? pageVideos : undefined,
        carouselCreatingAdIds:
          postType === "video_carousel" ? carouselCreatingAdIds : undefined,
        carouselGeneratingThumbIds:
          postType === "video_carousel" ? carouselGeneratingThumbIds : undefined,
      }),
    [
      postType,
      message,
      hashtags,
      filePath,
      link,
      photoPostMode,
      photoAlbumPaths,
      photoAlbumDestination,
      photoAlbumFacebookId,
      photoAlbumNewName,
      photoCarouselSlides,
      carouselSlides,
      pageVideos,
      carouselCreatingAdIds,
      carouselGeneratingThumbIds,
    ]
  );

  const selectablePageIds = useMemo(() => pages.map((p) => p.id), [pages]);
  const allPagesSelected =
    selectablePageIds.length > 0 && selectablePageIds.every((id) => selectedPageIds.includes(id));
  const somePagesSelected =
    !allPagesSelected && selectablePageIds.some((id) => selectedPageIds.includes(id));

  const refreshPages = useCallback(async () => {
    setPagesLoadError(null);
    try {
      await loadPages();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPagesLoadError(message);
      Message.error(message);
    }
  }, [loadPages]);

  const publishTiming = useMemo(
    (): MetaPublishTiming | undefined => buildPublishTiming(publishMode, scheduleValue),
    [publishMode, scheduleValue]
  );

  const scheduleReady = useMemo(() => {
    if (publishMode !== "schedule") return true;
    return isScheduleTimeValid(scheduleDayjsToUnixSec(scheduleValue), META_MIN_SCHEDULE_LEAD_MS);
  }, [publishMode, scheduleValue]);

  const publishPayload = useMemo(
    () => ({
      message: buildPublishMessage(message, hashtags),
      filePath: needsSingleFile ? filePath.trim() || undefined : undefined,
      filePaths:
        postType === "photo" && photoPostMode === "album" ? photoAlbumPaths : undefined,
      postType,
      photoPostMode: postType === "photo" ? photoPostMode : undefined,
      photoAlbumDestination:
        postType === "photo" && photoPostMode === "album" ? photoAlbumDestination : undefined,
      photoAlbumFacebookId:
        postType === "photo" && photoPostMode === "album" && photoAlbumDestination === "facebook_album"
          ? photoAlbumFacebookId.trim() || undefined
          : undefined,
      photoAlbumNewName:
        postType === "photo" && photoPostMode === "album" && photoAlbumDestination === "facebook_album"
          ? photoAlbumNewName.trim() || undefined
          : undefined,
      link: isCarousel || isPhotoCarousel ? link.trim() || undefined : undefined,
      carouselSlides: isCarousel
        ? peCarouselSlidesForPublish(carouselSlides, carouselCtaOption)
        : isPhotoCarousel
          ? photoCarouselSlidesForPublish(photoCarouselSlides, carouselCtaOption)
          : undefined,
      videoThumbnailPath:
        postType === "video" ? videoThumbnailPath.trim() || undefined : undefined,
      timing: publishTiming,
    }),
    [
      message,
      hashtags,
      needsSingleFile,
      filePath,
      postType,
      photoPostMode,
      photoAlbumPaths,
      photoAlbumDestination,
      photoAlbumFacebookId,
      photoAlbumNewName,
      isCarousel,
      isPhotoCarousel,
      link,
      carouselSlides,
      carouselCtaOption,
      photoCarouselSlides,
      videoThumbnailPath,
      publishTiming,
    ]
  );

  const setPipelineStatus = (pageId: string, status: PagePipelineStatus) => {
    setPagePipeline((prev) => ({ ...prev, [pageId]: status }));
  };

  const publishToSelectedPages = async () => {
    if (selectedPageIds.length === 0) {
      Message.warning("Select at least one Facebook Page.");
      return;
    }
    if (!contentReady) {
      Message.warning("Complete the post content before publishing.");
      return;
    }
    if (!scheduleReady) {
      Message.warning("Choose a schedule time at least 10 minutes from now.");
      return;
    }

    const originalPageId = config?.pageId;
    const originalPageName = config?.pageName;
    const verb = publishVerb;
    const doneLabel = publishDoneLabel;
    const queue = [...selectedPageIds];

    setPublishing(true);
    setPublishComplete(false);
    setPagePipeline(
      Object.fromEntries(queue.map((id) => [id, { state: "pending", message: "Waiting…" }]))
    );

    let okCount = 0;

    try {
      for (const pageId of queue) {
        const page = pages.find((p) => p.id === pageId);
        setPipelineStatus(pageId, { state: "running", message: `${verb}…` });

        try {
          await api.selectMetaPage({ pageId, pageName: page?.name });
          const result = await api.postToMetaPage(publishPayload);
          if (result.ok) {
            okCount += 1;
            setPipelineStatus(pageId, {
              state: "success",
              message: successPipelineMessage(doneLabel, result.postId),
              postId: result.postId,
            });
          } else {
            setPipelineStatus(pageId, {
              state: "error",
              message: result.message,
            });
          }
        } catch (err) {
          setPipelineStatus(pageId, {
            state: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (originalPageId) {
        await api.selectMetaPage({ pageId: originalPageId, pageName: originalPageName });
      }

      setPublishComplete(true);

      const total = queue.length;
      if (okCount === total) {
        Message.success(`${doneLabel} on ${okCount} Page${okCount === 1 ? "" : "s"}.`);
      } else if (okCount > 0) {
        Message.warning(`${doneLabel} on ${okCount}/${total} Pages.`);
      } else {
        Message.error("Could not publish to the selected Pages.");
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  const handleDone = () => {
    closePublish();
    onPublished?.();
  };

  const openPost = (pageId: string) => {
    const pipeline = pagePipeline[pageId];
    const url = facebookPostUrl(pageId, pipeline?.postId);
    if (!url) {
      Message.info("Post link is not available yet.");
      return;
    }
    void api.openExternal(url);
  };

  const renderPipelineStatus = (pageId: string, pipeline?: PagePipelineStatus) => {
    if (!pipeline) return null;

    if (pipeline.state === "pending") {
      return (
        <span className="publish-page-picker__pipeline publish-page-picker__pipeline--pending">
          <Time theme="outline" size="12" fill="currentColor" />
          <span>{pipeline.message}</span>
        </span>
      );
    }

    if (pipeline.state === "running") {
      return (
        <span className="publish-page-picker__pipeline publish-page-picker__pipeline--running">
          <Spin size={12} />
          <span>{pipeline.message}</span>
        </span>
      );
    }

    if (pipeline.state === "success") {
      return (
        <span className="publish-page-picker__pipeline publish-page-picker__pipeline--success">
          <CheckOne theme="filled" size="12" fill="currentColor" />
          <span>{pipeline.message}</span>
        </span>
      );
    }

    return (
      <span className="publish-page-picker__pipeline publish-page-picker__pipeline--error" title={pipeline.message}>
        <CloseOne theme="filled" size="12" fill="currentColor" />
        <span>{pipeline.message}</span>
      </span>
    );
  };

  const primaryActionLabel = publishComplete
    ? "Done"
    : publishMode === "schedule"
      ? selectedPageIds.length > 0
        ? `Schedule on ${selectedPageIds.length} Page${selectedPageIds.length === 1 ? "" : "s"}`
        : "Schedule"
      : selectedPageIds.length > 0
        ? `Publish to ${selectedPageIds.length} Page${selectedPageIds.length === 1 ? "" : "s"}`
        : "Publish now";

  const controlsLocked = publishing || publishComplete;
  const pipelineActive = publishing || publishComplete;
  const showPageList = !loadingPages && pages.length > 0;

  const renderPageListBody = () => {
    if (loadingPages) {
      return (
        <div className="publish-page-picker__center" role="status" aria-live="polite">
          <Spin size={28} />
          <span className="publish-page-picker__center-label">Loading Facebook Pages…</span>
        </div>
      );
    }

    if (pages.length === 0) {
      return (
        <div className="publish-page-picker__center publish-page-picker__center--empty">
          <Empty
            description={
              pagesLoadError
                ? pagesLoadError
                : "No Facebook Pages found for this account. Connect a Page in Meta Business settings, then refresh."
            }
          />
          <Button type="primary" size="small" onClick={() => void refreshPages()}>
            Refresh Pages
          </Button>
        </div>
      );
    }

    return (
      <ul className="publish-page-picker__list m-0 p-0 list-none">
        {pages.map((page) => {
          const selected = selectedPageIds.includes(page.id);
          const pipeline = pagePipeline[page.id];
          const canViewPost = pipeline?.state === "success" && pipeline.postId;

          return (
            <li
              key={page.id}
              className={`publish-page-picker__item ${pipelineRowClass(pipeline?.state)}`.trim()}
            >
              <label
                className={`publish-page-picker__row ${controlsLocked ? "publish-page-picker__row--locked" : ""}`.trim()}
                htmlFor={`publish-page-${page.id}`}
              >
                <Checkbox
                  id={`publish-page-${page.id}`}
                  checked={selected}
                  disabled={controlsLocked}
                  onChange={(checked) => togglePage(page.id, checked)}
                />
                <PageAvatar page={page} />
                <span className="publish-page-picker__info min-w-0 flex-1">
                  <span className="publish-page-picker__name">{page.name}</span>
                  {pipeline ? renderPipelineStatus(page.id, pipeline) : null}
                  {page.category && !pipeline ? (
                    <span className="publish-page-picker__meta">{page.category}</span>
                  ) : null}
                </span>
                {canViewPost ? (
                  <button
                    type="button"
                    className="publish-page-picker__view-post"
                    aria-label={`View post on ${page.name}`}
                    title="View post on Facebook"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openPost(page.id);
                    }}
                  >
                    <LinkIcon theme="outline" size="16" fill="currentColor" />
                  </button>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-16px">
      <div className="text-12px text-t-tertiary">
        Post type · <span className="text-t-primary font-500">{META_POST_TYPE_LABELS[postType]}</span>
        {message.trim() ? (
          <>
            {" "}
            · <span className="text-t-secondary">{message.trim().slice(0, 80)}{message.length > 80 ? "…" : ""}</span>
          </>
        ) : null}
        {sourceLabel ? (
          <>
            {" "}
            · from <span className="text-t-secondary">{sourceLabel}</span>
          </>
        ) : null}
      </div>

      <div className="publish-page-picker border border-b-base rd-12px overflow-hidden">
        <div className="publish-page-picker__head flex items-center justify-between gap-12px px-14px py-10px border-b border-b-base bg-3">
          <span className="text-12px font-600 uppercase tracking-wide text-t-secondary">
            {pipelineActive ? "Publish status" : "Facebook Pages"}
          </span>
          {showPageList ? (
            <Checkbox
              checked={allPagesSelected}
              indeterminate={somePagesSelected}
              disabled={controlsLocked}
              onChange={(checked) => selectAllPages(checked)}
            >
              Select all
            </Checkbox>
          ) : null}
        </div>
        <div className="publish-page-picker__panel">{renderPageListBody()}</div>
      </div>

      <PublishSchedulePicker
        mode={publishMode}
        onModeChange={setPublishMode}
        scheduleValue={scheduleValue}
        onScheduleChange={setScheduleValue}
        minLeadMs={META_MIN_SCHEDULE_LEAD_MS}
        disabled={controlsLocked || loadingPages || pages.length === 0}
      />

      <div className="publish-page__actions flex items-center gap-12px w-full pt-4px">
        {!publishComplete ? (
          <Button onClick={onCancel} disabled={publishing}>
            {cancelLabel}
          </Button>
        ) : null}
        <div className="flex-1 min-w-0" />
        <Button
          type="primary"
          disabled={
            publishComplete
              ? false
              : publishing ||
                loadingPages ||
                pages.length === 0 ||
                selectedPageIds.length === 0 ||
                !contentReady ||
                !scheduleReady
          }
          onClick={() => void (publishComplete ? handleDone() : publishToSelectedPages())}
        >
          {publishing ? `${publishMode === "schedule" ? "Scheduling" : "Publishing"}…` : primaryActionLabel}
        </Button>
      </div>
    </div>
  );
};

export default MetaPublishPagePicker;

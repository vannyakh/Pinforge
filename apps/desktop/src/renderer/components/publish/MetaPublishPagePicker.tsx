import React, { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Message } from "@arco-design/web-react";
import { Link as LinkIcon } from "@icon-park/react";
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
import { api, type MetaPublishTiming } from "@renderer/api";
import {
  META_POST_TYPE_LABELS,
  isPublishDraftReady,
  peCarouselSlidesForPublish,
  photoCarouselSlidesForPublish,
  useMetaPublishStore,
} from "@renderer/pages/publish/metaPublishStore";
import { buildPublishMessage } from "@renderer/components/publish/publishComposeMessage";

type PagePublishResult = {
  ok: boolean;
  postId?: string;
  message: string;
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
  const [pageResults, setPageResults] = useState<Record<string, PagePublishResult>>({});
  const [publishMode, setPublishMode] = useState<PublishScheduleMode>("now");
  const [scheduleValue, setScheduleValue] = useState<Dayjs | undefined>(() =>
    defaultScheduleDayjs(META_MIN_SCHEDULE_LEAD_MS)
  );

  useEffect(() => {
    setPublishMode("now");
    setScheduleValue(defaultScheduleDayjs(META_MIN_SCHEDULE_LEAD_MS));
    setPageResults({});
    setPublishComplete(false);
  }, []);

  const isCarousel = postType === "video_carousel";
  const isPhotoCarousel = postType === "photo" && photoPostMode === "carousel";
  const needsSingleFile =
    postType === "video" || (postType === "photo" && photoPostMode === "single");

  const contentReady = useMemo(
    () =>
      isPublishDraftReady({
        postType,
        message,
        filePath,
        link,
        photoPostMode,
        photoAlbumPaths,
        photoAlbumDestination,
        photoAlbumFacebookId,
        photoAlbumNewName,
        photoCarouselSlides,
        carouselSlides,
      }),
    [
      postType,
      message,
      filePath,
      link,
      photoPostMode,
      photoAlbumPaths,
      photoAlbumDestination,
      photoAlbumFacebookId,
      photoAlbumNewName,
      photoCarouselSlides,
      carouselSlides,
    ]
  );

  const selectablePageIds = useMemo(() => pages.map((p) => p.id), [pages]);
  const allPagesSelected =
    selectablePageIds.length > 0 && selectablePageIds.every((id) => selectedPageIds.includes(id));
  const somePagesSelected =
    !allPagesSelected && selectablePageIds.some((id) => selectedPageIds.includes(id));

  const refreshPages = async () => {
    try {
      await loadPages();
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    }
  };

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
    const doneLabel = publishMode === "schedule" ? "Scheduled" : "Published";

    setPublishing(true);
    setPageResults({});
    const results: Record<string, PagePublishResult> = {};

    try {
      for (const pageId of selectedPageIds) {
        const page = pages.find((p) => p.id === pageId);
        try {
          await api.selectMetaPage({ pageId, pageName: page?.name });
          const result = await api.postToMetaPage(publishPayload);
          results[pageId] = {
            ok: result.ok,
            postId: result.postId,
            message: result.message,
          };
        } catch (err) {
          results[pageId] = {
            ok: false,
            message: err instanceof Error ? err.message : String(err),
          };
        }
      }

      if (originalPageId) {
        await api.selectMetaPage({ pageId: originalPageId, pageName: originalPageName });
      }

      setPageResults(results);
      setPublishComplete(true);

      const okCount = Object.values(results).filter((r) => r.ok).length;
      const total = Object.keys(results).length;
      if (okCount === total) {
        Message.success(`${doneLabel} on ${okCount} Page${okCount === 1 ? "" : "s"}.`);
      } else if (okCount > 0) {
        Message.warning(`${doneLabel} on ${okCount}/${total} Pages. Use the link icon to view successful posts.`);
      } else {
        Message.error(Object.values(results)[0]?.message ?? "Could not publish to the selected Pages.");
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
    const result = pageResults[pageId];
    const url = facebookPostUrl(pageId, result?.postId);
    if (!url) {
      Message.info("Post link is not available yet.");
      return;
    }
    void api.openExternal(url);
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

      {loadingPages ? (
        <div className="text-13px text-t-secondary py-8px">Loading Pages…</div>
      ) : pages.length === 0 ? (
        <div className="flex flex-col gap-8px">
          <p className="text-13px text-t-secondary m-0">No Facebook Pages found for this account.</p>
          <Button size="small" onClick={() => void refreshPages()}>
            Refresh Pages
          </Button>
        </div>
      ) : (
        <div className="publish-page-picker border border-b-base rd-12px overflow-hidden">
          <div className="publish-page-picker__head flex items-center justify-between gap-12px px-14px py-10px border-b border-b-base bg-3">
            <span className="text-12px font-600 uppercase tracking-wide text-t-secondary">Facebook Pages</span>
            <Checkbox
              checked={allPagesSelected}
              indeterminate={somePagesSelected}
              disabled={controlsLocked}
              onChange={(checked) => selectAllPages(checked)}
            >
              Select all
            </Checkbox>
          </div>
          <ul className="publish-page-picker__list m-0 p-0 list-none">
            {pages.map((page) => {
              const selected = selectedPageIds.includes(page.id);
              const result = pageResults[page.id];
              const canViewPost = publishComplete && selected && result?.ok && result.postId;

              return (
                <li
                  key={page.id}
                  className={`publish-page-picker__item ${canViewPost ? "is-published" : ""}`.trim()}
                >
                  <div className="publish-page-picker__row">
                    <Checkbox
                      checked={selected}
                      disabled={controlsLocked}
                      onChange={(checked) => togglePage(page.id, checked)}
                    />
                    <span className="publish-page-picker__body min-w-0 flex-1">
                      <span className="publish-page-picker__name text-14px font-500 text-t-primary">
                        {page.name}
                      </span>
                      {page.category ? (
                        <span className="publish-page-picker__meta text-12px text-t-secondary">
                          {page.category}
                        </span>
                      ) : null}
                    </span>
                    {canViewPost ? (
                      <button
                        type="button"
                        className="publish-page-picker__view-post"
                        aria-label={`View post on ${page.name}`}
                        title="View post on Facebook"
                        onClick={() => openPost(page.id)}
                      >
                        <LinkIcon theme="outline" size="16" fill="currentColor" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <PublishSchedulePicker
        mode={publishMode}
        onModeChange={setPublishMode}
        scheduleValue={scheduleValue}
        onScheduleChange={setScheduleValue}
        minLeadMs={META_MIN_SCHEDULE_LEAD_MS}
        disabled={controlsLocked}
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
              : publishing || selectedPageIds.length === 0 || !contentReady || !scheduleReady
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

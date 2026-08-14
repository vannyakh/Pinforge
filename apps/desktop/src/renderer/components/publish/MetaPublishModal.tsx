import React, { useEffect, useMemo, useState } from "react";
import { Button, Message } from "@arco-design/web-react";
import type { Dayjs } from "dayjs";
import { useNavigate } from "react-router-dom";
import AionModal from "@renderer/components/base/AionModal";
import MetaPublishComposeFields from "@renderer/components/publish/MetaPublishComposeFields";
import MetaPublishPagePicker from "@renderer/components/publish/MetaPublishPagePicker";
import PublishSchedulePicker from "@renderer/components/publish/PublishSchedulePicker";
import {
  buildPublishTiming,
  defaultScheduleDayjs,
  isScheduleTimeValid,
  META_MIN_SCHEDULE_LEAD_MS,
  scheduleDayjsToUnixSec,
} from "@renderer/components/publish/publishSchedule";
import { api, type MetaPostResult, type MetaPublishTimingMode } from "@renderer/api";
import facebookLogo from "@renderer/assets/provider-logos/facebook.svg";
import {
  isPublishDraftReady,
  peCarouselSlidesForPublish,
  photoCarouselSlidesForPublish,
  useMetaPublishStore,
} from "@renderer/pages/publish/metaPublishStore";
import { buildPublishMessage } from "@renderer/components/publish/publishComposeMessage";

const MetaPublishModal: React.FC = () => {
  const navigate = useNavigate();
  const modalOpen = useMetaPublishStore((s) => s.modalOpen);
  const modalMode = useMetaPublishStore((s) => s.modalMode);
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
  const hidePostTypePicker = useMetaPublishStore((s) => s.hidePostTypePicker);
  const closePublish = useMetaPublishStore((s) => s.closePublish);
  const config = useMetaPublishStore((s) => s.config);
  const loadingConfig = useMetaPublishStore((s) => s.loadingConfig);

  const [publishing, setPublishing] = useState(false);
  const [publishMode, setPublishMode] = useState<MetaPublishTimingMode>("now");
  const [scheduleValue, setScheduleValue] = useState<Dayjs | undefined>(() =>
    defaultScheduleDayjs(META_MIN_SCHEDULE_LEAD_MS)
  );

  useEffect(() => {
    if (!modalOpen || modalMode !== "compose") return;
    setPublishMode("now");
    setScheduleValue(defaultScheduleDayjs(META_MIN_SCHEDULE_LEAD_MS));
  }, [modalOpen, modalMode]);

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
    ]
  );

  const publishTiming = useMemo(
    () => buildPublishTiming(publishMode, scheduleValue),
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

  const publishCompose = async () => {
    if (!contentReady) {
      Message.warning("Complete the post content before publishing.");
      return;
    }
    if (!scheduleReady) {
      Message.warning("Choose a schedule time at least 10 minutes from now.");
      return;
    }
    if (!config?.hasPageToken) {
      Message.error("Select a Facebook Page before posting.");
      return;
    }

    setPublishing(true);
    const unsub = api.onMetaPublishProgress((ev) => {
      if (ev.pageId === config.pageId) {
        Message.loading({ content: ev.message, duration: 0, id: "meta-publish-progress" });
      }
    });

    try {
      const result: MetaPostResult = await api.postToMetaPage(publishPayload);
      Message.clear();
      if (!result.ok) {
        Message.error(result.message);
        return;
      }
      Message.success(result.postId ? `${result.message} (ID: ${result.postId})` : result.message);
      closePublish();
    } catch (err) {
      Message.clear();
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      unsub();
      setPublishing(false);
    }
  };

  const openSettings = () => {
    closePublish();
    void navigate("/settings/publishing");
  };

  const publishTimingFields = (
    <PublishSchedulePicker
      mode={publishMode}
      onModeChange={setPublishMode}
      scheduleValue={scheduleValue}
      onScheduleChange={setScheduleValue}
      minLeadMs={META_MIN_SCHEDULE_LEAD_MS}
    />
  );

  const composeFooter = (
    <div className="flex justify-end gap-10px w-full">
      <Button onClick={closePublish}>Cancel</Button>
      <Button
        type="primary"
        loading={publishing}
        disabled={!contentReady || !config?.hasPageToken || !scheduleReady}
        onClick={() => void publishCompose()}
      >
        {publishMode === "schedule" ? "Schedule post" : "Publish now"}
      </Button>
    </div>
  );

  if (modalMode === "pages") {
    return (
      <AionModal
        variant="standard"
        visible={modalOpen}
        header={{
          title: (
            <span className="inline-flex items-center gap-8px">
              <img src={facebookLogo} alt="" className="remote-channel-logo" draggable={false} />
              Select Pages to publish
            </span>
          ),
          showClose: true,
        }}
        onCancel={closePublish}
        autoFocus={false}
        focusLock
        unmountOnExit
        footer={null}
        style={{ width: 520 }}
      >
        {loadingConfig ? (
          <div className="text-13px text-t-secondary py-12px">Loading…</div>
        ) : !config?.connected ? (
          <div className="flex flex-col gap-12px py-4px">
            <p className="text-13px text-t-secondary m-0">
              Connect your Meta Developer App and Facebook account in Publishing settings before
              posting.
            </p>
            <Button type="primary" onClick={openSettings}>
              Open Publishing settings
            </Button>
          </div>
        ) : (
          <MetaPublishPagePicker onCancel={closePublish} onPublished={closePublish} />
        )}
      </AionModal>
    );
  }

  return (
    <AionModal
      variant="standard"
      visible={modalOpen}
      header={{
        title: (
          <span className="inline-flex items-center gap-8px">
            <img src={facebookLogo} alt="" className="remote-channel-logo" draggable={false} />
            Publish to Facebook Page
          </span>
        ),
        showClose: true,
      }}
      onCancel={closePublish}
      autoFocus={false}
      focusLock
      unmountOnExit
      footer={composeFooter}
      style={{ width: isCarousel ? 720 : 520 }}
    >
      {loadingConfig ? (
        <div className="text-13px text-t-secondary py-12px">Loading…</div>
      ) : !config?.connected ? (
        <div className="flex flex-col gap-12px py-4px">
          <p className="text-13px text-t-secondary m-0">
            Connect your Meta Developer App and Facebook account in Publishing settings before
            posting.
          </p>
          <Button type="primary" onClick={openSettings}>
            Open Publishing settings
          </Button>
        </div>
      ) : !config.hasPageToken ? (
        <div className="flex flex-col gap-12px py-4px">
          <p className="text-13px text-t-secondary m-0">
            Select a Facebook Page in Publishing settings before posting.
          </p>
          <Button type="primary" onClick={openSettings}>
            Open Publishing settings
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-14px">
          <div className="text-12px text-t-tertiary">
            Posting as <span className="text-t-primary font-500">{config.pageName ?? "Page"}</span>
            {sourceLabel ? (
              <>
                {" "}
                · from <span className="text-t-secondary">{sourceLabel}</span>
              </>
            ) : null}
          </div>
          <MetaPublishComposeFields showPostTypePicker={!hidePostTypePicker} pageId={config.pageId} />
          {publishTimingFields}
        </div>
      )}
    </AionModal>
  );
};

export default MetaPublishModal;

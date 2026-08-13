import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Message, Select } from "@arco-design/web-react";
import CarouselSourceModal from "@renderer/components/publish/CarouselSourceModal";
import PeCarouselBuilder from "@renderer/components/publish/PeCarouselBuilder";
import PhotoPostBuilder from "@renderer/components/publish/PhotoPostBuilder";
import PublishCaptionSection from "@renderer/components/publish/PublishCaptionSection";
import PublishHashtagSection from "@renderer/components/publish/PublishHashtagSection";
import PublishPostPreview from "@renderer/components/publish/PublishPostPreview";
import { pathToPreview } from "@renderer/components/publish/carouselPreview";
import { api, type MetaPageVideoSummary, type MetaPostType } from "@renderer/api";
import {
  META_POST_TYPE_LABELS,
  useMetaPublishStore,
  type CarouselSlideDraft,
} from "@renderer/pages/publish/metaPublishStore";

const POST_TYPE_OPTIONS: MetaPostType[] = ["text", "photo", "video", "video_carousel"];

const COMPOSE_MEDIA_SLIDE_ID = "compose-media";

type MetaPublishComposeFieldsProps = {
  showPostTypePicker?: boolean;
  pageId?: string;
  inlinePreview?: boolean;
};

const MetaPublishComposeFields: React.FC<MetaPublishComposeFieldsProps> = ({
  showPostTypePicker = false,
  pageId,
  inlinePreview = false,
}) => {
  const postType = useMetaPublishStore((s) => s.postType);
  const photoPostMode = useMetaPublishStore((s) => s.photoPostMode);
  const filePath = useMetaPublishStore((s) => s.filePath);
  const videoThumbnailPath = useMetaPublishStore((s) => s.videoThumbnailPath);
  const config = useMetaPublishStore((s) => s.config);
  const setPostType = useMetaPublishStore((s) => s.setPostType);
  const setFilePath = useMetaPublishStore((s) => s.setFilePath);
  const setVideoThumbnailPath = useMetaPublishStore((s) => s.setVideoThumbnailPath);

  const [pageVideos, setPageVideos] = useState<MetaPageVideoSummary[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);

  const loadPageVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      setPageVideos(await api.listMetaPageVideos(30));
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingVideos(false);
    }
  }, []);

  const isCarousel = postType === "video_carousel";
  const isVideoPost = postType === "video";
  const isPhotoPost = postType === "photo";
  const isTextPost = postType === "text";
  const isSinglePhoto = isPhotoPost && photoPostMode === "single";
  const carouselPageId = pageId ?? config?.pageId;

  useEffect(() => {
    if (!config?.connected) return;
    if (isCarousel || isVideoPost) void loadPageVideos();
  }, [isCarousel, isVideoPost, config?.connected, loadPageVideos]);

  const composeMediaSlide = useMemo((): CarouselSlideDraft | null => {
    if (!isSinglePhoto && !isVideoPost) return null;
    return {
      id: COMPOSE_MEDIA_SLIDE_ID,
      kind: isVideoPost ? "video" : "photo",
      filePath: filePath.trim() || undefined,
      videoThumbnailPath: videoThumbnailPath.trim() || undefined,
      previewUrl: filePath.trim() ? pathToPreview(filePath.trim()) : undefined,
    };
  }, [isSinglePhoto, isVideoPost, filePath, videoThumbnailPath]);

  const showMediaPreview = isVideoPost || isSinglePhoto;

  return (
    <div className="post-builder flex flex-col gap-18px">
      {showPostTypePicker ? (
        <div className="flex flex-col gap-6px">
          <Select
            value={postType}
            onChange={(v) => setPostType(v as MetaPostType)}
            options={POST_TYPE_OPTIONS.map((t) => ({
              label: META_POST_TYPE_LABELS[t],
              value: t,
            }))}
          />
        </div>
      ) : (
        <div className="text-12px text-t-tertiary">
          Post type · <span className="text-t-primary font-500">{META_POST_TYPE_LABELS[postType]}</span>
        </div>
      )}

      {isCarousel ? (
        <PeCarouselBuilder
          pageId={carouselPageId}
          pageName={config?.pageName}
          inlinePreview={inlinePreview}
          pageVideos={pageVideos}
          loadingVideos={loadingVideos}
          onRefreshVideos={() => void loadPageVideos()}
        />
      ) : (
        <>
          {isPhotoPost ? <PhotoPostBuilder metaConnected={Boolean(config?.connected)} /> : null}
          <PublishCaptionSection
            placeholder={
              isTextPost ? "Write your Page post…" : "Optional caption for your media…"
            }
          />
          <PublishHashtagSection />
          {showMediaPreview || isPhotoPost ? (
            <PublishPostPreview
              postType={postType}
              pageId={carouselPageId}
              pageName={config?.pageName}
              inlinePreview={inlinePreview}
              slide={composeMediaSlide}
              videoThumbnailPath={videoThumbnailPath}
              onOpenSource={() => setSourceModalOpen(true)}
              onThumbnailPathChange={setVideoThumbnailPath}
            />
          ) : isTextPost ? (
            <PublishPostPreview
              postType={postType}
              pageId={carouselPageId}
              pageName={config?.pageName}
              inlinePreview={inlinePreview}
              slide={null}
              videoThumbnailPath=""
              onOpenSource={() => setSourceModalOpen(true)}
              onThumbnailPathChange={setVideoThumbnailPath}
            />
          ) : null}
        </>
      )}

      <CarouselSourceModal
        visible={sourceModalOpen}
        slide={composeMediaSlide}
        pageVideos={pageVideos}
        variant="post"
        onClose={() => setSourceModalOpen(false)}
        onApply={(patch) => {
          if (patch.filePath?.trim()) setFilePath(patch.filePath.trim());
          setSourceModalOpen(false);
        }}
      />
    </div>
  );
};

export default MetaPublishComposeFields;

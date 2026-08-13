import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Divider, Empty, Select, Spin } from "@arco-design/web-react";
import { FolderOpen, Pic, PlayOne, Refresh, VideoOne } from "@icon-park/react";
import AionModal from "@renderer/components/base/AionModal";
import {
  previewUrlForLocalPath,
  slidePreviewUrl,
} from "@renderer/components/publish/carouselPreview";
import { DEFAULT_PE_CARD_FOOTER } from "@renderer/pages/publish/metaPublishStore";
import type { CarouselSlideDraft } from "@renderer/pages/publish/metaPublishStore";
import { api, type MetaPageVideoSummary } from "@renderer/api";

type SourceDraft = {
  pageVideoId?: string;
  filePath?: string;
  previewUrl?: string;
  name?: string;
};

type CarouselSourceModalProps = {
  visible: boolean;
  slide: CarouselSlideDraft | null;
  pageVideos: MetaPageVideoSummary[];
  loadingVideos: boolean;
  onRefreshVideos: () => void;
  onClose: () => void;
  onApply: (patch: Partial<CarouselSlideDraft>) => void;
};

function draftFromSlide(slide: CarouselSlideDraft | null): SourceDraft {
  if (!slide) return {};
  return {
    pageVideoId: slide.pageVideoId,
    filePath: slide.filePath,
    previewUrl: slide.previewUrl,
    name: slide.name,
  };
}

function draftHasSource(draft: SourceDraft, kind: CarouselSlideDraft["kind"]): boolean {
  if (kind === "video") return Boolean(draft.pageVideoId?.trim() || draft.filePath?.trim());
  return Boolean(draft.filePath?.trim());
}

function draftPreviewUrl(
  draft: SourceDraft,
  kind: CarouselSlideDraft["kind"],
  pageVideos: MetaPageVideoSummary[]
): string | undefined {
  return slidePreviewUrl(
    {
      id: "draft",
      kind,
      pageVideoId: draft.pageVideoId,
      filePath: draft.filePath,
      previewUrl: draft.previewUrl,
    },
    pageVideos
  );
}

type PreviewImageProps = {
  src?: string;
  className: string;
  fallback: React.ReactNode;
};

const PreviewImage: React.FC<PreviewImageProps> = ({ src, className, fallback }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return <>{fallback}</>;
  return <img src={src} alt="" className={className} onError={() => setFailed(true)} />;
};

const CarouselSourceModal: React.FC<CarouselSourceModalProps> = ({
  visible,
  slide,
  pageVideos,
  loadingVideos,
  onRefreshVideos,
  onClose,
  onApply,
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pickingFile, setPickingFile] = useState(false);
  const [draft, setDraft] = useState<SourceDraft>({});
  const isVideo = slide?.kind === "video";

  useEffect(() => {
    if (!visible) return;
    setDraft(draftFromSlide(slide));
  }, [visible, slide]);

  const pageVideoOptions = useMemo(
    () =>
      pageVideos.map((v) => ({
        label: v.title?.trim() || `Video ${v.id}`,
        value: v.id,
      })),
    [pageVideos]
  );

  const preview = useMemo(
    () => (slide ? draftPreviewUrl(draft, slide.kind, pageVideos) : undefined),
    [draft, slide, pageVideos]
  );

  const canApply = slide ? draftHasSource(draft, slide.kind) : false;
  const ctaText = slide?.description?.trim() || DEFAULT_PE_CARD_FOOTER;
  const fileLabel = draft.filePath?.split(/[/\\]/).pop() ?? draft.name;

  const handleClose = useCallback(() => {
    if (pickingFile) return;
    onClose();
  }, [onClose, pickingFile]);

  const selectPageVideo = (videoId: string) => {
    const video = pageVideos.find((item) => item.id === videoId);
    setDraft({
      pageVideoId: videoId,
      filePath: undefined,
      previewUrl: video?.thumbnailUrl,
      name: video?.title ?? slide?.name,
    });
  };

  const pickLocalFile = async () => {
    if (!slide || pickingFile) return;
    setPickingFile(true);
    try {
      const path = await api.pickMediaFile();
      if (!path) return;
      setDraft({
        pageVideoId: undefined,
        filePath: path,
        previewUrl: previewUrlForLocalPath(path, slide.kind),
        name: slide.name || path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, ""),
      });
    } finally {
      setPickingFile(false);
    }
  };

  const handleApply = () => {
    if (!slide || !canApply) return;
    onApply({
      pageVideoId: draft.pageVideoId,
      filePath: draft.filePath,
      previewUrl: draft.previewUrl,
      name: draft.name,
    });
    onClose();
  };

  const popupContainer = () => bodyRef.current ?? document.body;

  const footer = (
    <div className="flex justify-end gap-10px w-full">
      <Button onClick={handleClose} disabled={pickingFile}>
        Cancel
      </Button>
      <Button type="primary" disabled={!canApply || pickingFile} onClick={handleApply}>
        {isVideo ? "Use this video" : "Use this photo"}
      </Button>
    </div>
  );

  return (
    <AionModal
      key={slide?.id ?? "carousel-source"}
      variant="standard"
      visible={visible}
      onCancel={handleClose}
      autoFocus={false}
      focusLock={false}
      unmountOnExit
      maskClosable={!pickingFile}
      escToExit={!pickingFile}
      header={{
        title: isVideo ? "Select video" : "Select photo",
        subtitle: isVideo
          ? "Pick from your Page library or upload a local file."
          : "Upload a photo from your computer.",
        showClose: true,
      }}
      footer={{ render: () => footer, divider: true }}
      style={{ width: 720 }}
    >
      <div ref={bodyRef} className="carousel-source-modal">
        <section className="carousel-source-modal__source">
          {isVideo ? (
            <>
              <div className="carousel-source-modal__block">
                <div className="carousel-source-modal__block-head">
                  <span className="carousel-source-modal__block-title">Page library</span>
                  <Button
                    size="mini"
                    type="text"
                    icon={<Refresh theme="outline" size="14" fill="currentColor" />}
                    loading={loadingVideos}
                    onClick={onRefreshVideos}
                  >
                    Refresh
                  </Button>
                </div>
                <Select
                  allowClear
                  placeholder="Choose from Page…"
                  value={draft.pageVideoId}
                  options={pageVideoOptions}
                  loading={loadingVideos}
                  getPopupContainer={popupContainer}
                  triggerProps={{ autoAlignPopupWidth: true }}
                  onChange={(v) => {
                    if (v) selectPageVideo(String(v));
                    else setDraft((prev) => ({ ...prev, pageVideoId: undefined, previewUrl: undefined }));
                  }}
                />
                <div className="carousel-source-modal__video-grid">
                  {loadingVideos ? (
                    <div className="carousel-source-modal__video-grid-empty">
                      <Spin size={16} />
                      <span>Loading Page videos…</span>
                    </div>
                  ) : pageVideos.length === 0 ? (
                    <Empty description="No Page videos found" />
                  ) : (
                    pageVideos.map((video) => {
                      const active = draft.pageVideoId === video.id;
                      return (
                        <button
                          key={video.id}
                          type="button"
                          className={`carousel-source-modal__video-item ${active ? "is-active" : ""}`}
                          onClick={() => selectPageVideo(video.id)}
                        >
                          <div className="carousel-source-modal__video-item__media">
                            {video.thumbnailUrl ? (
                              <img src={video.thumbnailUrl} alt="" className="carousel-source-modal__video-item__img" />
                            ) : (
                              <VideoOne theme="outline" size="20" fill="currentColor" />
                            )}
                            <span className="carousel-source-modal__video-item__play" aria-hidden>
                              <PlayOne theme="filled" size="16" fill="currentColor" />
                            </span>
                          </div>
                          <span className="carousel-source-modal__video-item__title truncate">
                            {video.title?.trim() || `Video ${video.id}`}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <Divider className="carousel-source-modal__divider">or upload local file</Divider>
            </>
          ) : null}

          <div className="carousel-source-modal__block">
            <div className="carousel-source-modal__block-title">
              {isVideo ? "Local file" : "Upload file"}
            </div>
            <button
              type="button"
              className="carousel-source-modal__browse"
              disabled={pickingFile}
              onClick={() => void pickLocalFile()}
            >
              {pickingFile ? (
                <Spin size={18} />
              ) : (
                <FolderOpen theme="outline" size="22" fill="currentColor" />
              )}
              <span>{isVideo ? "Browse for video…" : "Browse for photo…"}</span>
            </button>
            {fileLabel ? (
              <div className="carousel-source-modal__file text-12px text-t-secondary truncate">
                Selected · {fileLabel}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="carousel-source-modal__preview">
          <div className="carousel-source-modal__preview-label">Card preview</div>
          <div className="carousel-source-modal__preview-card">
            <div className="carousel-source-modal__preview-media">
              <PreviewImage
                src={preview}
                className="carousel-source-modal__preview-img"
                fallback={
                  isVideo ? (
                    <VideoOne theme="outline" size="36" fill="currentColor" className="text-t-tertiary" />
                  ) : (
                    <Pic theme="outline" size="36" fill="currentColor" className="text-t-tertiary" />
                  )
                }
              />
              {isVideo && canApply ? (
                <span className="carousel-source-modal__preview-play" aria-hidden>
                  <PlayOne theme="filled" size="28" fill="currentColor" />
                </span>
              ) : null}
            </div>
            <div className="carousel-source-modal__preview-cta truncate">
              {canApply ? ctaText : `Add ${isVideo ? "video" : "photo"}`}
            </div>
            <div className="carousel-source-modal__preview-slot">
              {isVideo ? "Left · Video" : "Right · Photo"}
            </div>
          </div>
          <p className="carousel-source-modal__preview-hint text-12px text-t-tertiary m-0">
            This is how the carousel card will appear on your Page feed.
          </p>
        </aside>
      </div>
    </AionModal>
  );
};

export default CarouselSourceModal;

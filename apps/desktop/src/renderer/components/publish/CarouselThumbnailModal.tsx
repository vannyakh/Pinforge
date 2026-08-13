import React from "react";
import { Camera } from "@icon-park/react";
import { Spin } from "@arco-design/web-react";
import AionModal from "@renderer/components/base/AionModal";
import type { CarouselThumbnailAsset } from "@renderer/components/publish/carouselThumbnailAssets";
import { slotHasSource } from "@renderer/components/publish/carouselPreview";
import type { CarouselSlideDraft } from "@renderer/pages/publish/metaPublishStore";

type SlidePreviewImageProps = {
  src?: string;
  alt: string;
  className: string;
  fallback: React.ReactNode;
};

const SlidePreviewImage: React.FC<SlidePreviewImageProps> = ({ src, alt, className, fallback }) => {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return <>{fallback}</>;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
};

type CarouselThumbnailModalProps = {
  visible: boolean;
  slide: CarouselSlideDraft | null;
  libraryThumbnails: CarouselThumbnailAsset[];
  generatedThumbnails: CarouselThumbnailAsset[];
  generating?: boolean;
  isApplied: (thumb: CarouselThumbnailAsset) => boolean;
  onClose: () => void;
  onPick: (thumb: CarouselThumbnailAsset) => void | Promise<void>;
  onUpload: () => void | Promise<void>;
};

const CarouselThumbnailModal: React.FC<CarouselThumbnailModalProps> = ({
  visible,
  slide,
  libraryThumbnails,
  generatedThumbnails,
  generating = false,
  isApplied,
  onClose,
  onPick,
  onUpload,
}) => {
  const isVideo = slide?.kind === "video";
  const hasSource = slide ? slotHasSource(slide) : false;

  const uploadLabel = isVideo
    ? hasSource
      ? "Upload thumbnail"
      : "Upload video"
    : "Upload photo";

  const subtitle = isVideo
    ? hasSource
      ? "Pick a JPEG cover for the video card — suitable for public Page posts."
      : "Add a video first, or upload one here."
    : "Pick an image for the photo card.";

  const showGenerated = isVideo && generatedThumbnails.length > 0;

  return (
    <AionModal
      variant="standard"
      visible={visible}
      onCancel={onClose}
      autoFocus={false}
      unmountOnExit
      maskClosable={!generating}
      escToExit={!generating}
      header={{
        title: isVideo ? "Video thumbnail" : "Photo card",
        subtitle,
        showClose: true,
      }}
      style={{ width: 560 }}
    >
      {generating ? (
        <div className="carousel-thumb-modal__loading flex-center flex-col gap-10px py-32px">
          <Spin size={28} />
          <span className="text-13px text-t-secondary">Generating thumbnails from video…</span>
        </div>
      ) : (
        <div className="carousel-thumb-modal__sections">
          {showGenerated ? (
            <div className="carousel-thumb-modal__section">
              <div className="carousel-thumb-modal__section-label">From video</div>
              <div className="carousel-thumb-modal__grid">
                {generatedThumbnails.map((thumb) => (
                  <button
                    key={thumb.id}
                    type="button"
                    className={`post-builder__preset-thumb ${isApplied(thumb) ? "is-applied" : ""}`}
                    title={thumb.label}
                    onClick={() => void onPick(thumb)}
                  >
                    <SlidePreviewImage
                      src={thumb.previewUrl}
                      alt={thumb.label}
                      className="post-builder__preset-thumb__img"
                      fallback={
                        <span className="post-builder__preset-thumb__fallback">{thumb.label}</span>
                      }
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="carousel-thumb-modal__section">
            {showGenerated ? (
              <div className="carousel-thumb-modal__section-label">Library</div>
            ) : null}
            <div className="carousel-thumb-modal__grid">
              <button type="button" className="post-builder__upload-tile" onClick={() => void onUpload()}>
                <Camera theme="outline" size="22" fill="currentColor" />
                <span>{uploadLabel}</span>
              </button>

              {libraryThumbnails.map((thumb) => (
                <button
                  key={thumb.id}
                  type="button"
                  className={`post-builder__preset-thumb ${isApplied(thumb) ? "is-applied" : ""}`}
                  title={thumb.label}
                  onClick={() => void onPick(thumb)}
                >
                  <SlidePreviewImage
                    src={thumb.previewUrl}
                    alt={thumb.label}
                    className="post-builder__preset-thumb__img"
                    fallback={
                      <span className="post-builder__preset-thumb__fallback">{thumb.label}</span>
                    }
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </AionModal>
  );
};

export default CarouselThumbnailModal;

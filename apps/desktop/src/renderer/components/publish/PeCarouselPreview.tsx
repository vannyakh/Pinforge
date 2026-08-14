import React from "react";
import { Spin, Tooltip } from "@arco-design/web-react";
import { Camera, CloseOne, Like, Pic, Plus, UploadOne } from "@icon-park/react";
import {
  CarouselSlidePhotoMedia,
  CarouselSlideVideoPreview,
  carouselSlotFilled,
  renderCarouselSlotFallback,
} from "@renderer/components/publish/carouselSlideMedia";
import {
  carouselSlotHasSource,
  carouselSlotLabel,
  carouselSlotPipelinePhase,
  type CarouselSlotPipelinePhase,
  videoCardNeedsThumbnail,
} from "@renderer/components/publish/carouselMediaTypes";
import {
  FIXED_CAROUSEL_SLOTS,
  type CarouselSlideDraft,
} from "@renderer/pages/publish/metaPublishStore";
import type { MetaPageVideoSummary } from "@renderer/api";

export type PeCarouselPreviewProps = {
  pageLabel: string;
  pageInitial: string;
  caption: string;
  carouselSlides: CarouselSlideDraft[];
  pageVideos: MetaPageVideoSummary[];
  ctaText: string;
  ctaButtonLabel: string;
  ctaOption: string;
  inlinePreview?: boolean;
  showPreviewBadge?: boolean;
  badgeLabel?: string;
  generatingSlideIds?: Record<string, boolean>;
  creatingAdSlideIds?: Record<string, boolean>;
  onCardMediaClick: (slide: CarouselSlideDraft) => void;
  onChangeSourceClick: (slide: CarouselSlideDraft) => void;
  onQuickUpload: (slide: CarouselSlideDraft) => void;
  onPickThumbnailClick: (slide: CarouselSlideDraft) => void;
  onClearSourceClick: (slide: CarouselSlideDraft) => void;
};

type SlotToolbarProps = {
  slide: CarouselSlideDraft;
  isVideo: boolean;
  phase: CarouselSlotPipelinePhase;
  needsThumb: boolean;
  canClearSource: boolean;
  onQuickUpload: (slide: CarouselSlideDraft) => void;
  onChangeSourceClick: (slide: CarouselSlideDraft) => void;
  onPickThumbnailClick: (slide: CarouselSlideDraft) => void;
  onClearSourceClick: (slide: CarouselSlideDraft) => void;
};

const SlotToolbar: React.FC<SlotToolbarProps> = ({
  slide,
  isVideo,
  phase,
  needsThumb,
  canClearSource,
  onQuickUpload,
  onChangeSourceClick,
  onPickThumbnailClick,
  onClearSourceClick,
}) => {
  if (phase === "generate_thumbnails" || phase === "create_ad") return null;

  const showSourceActions = phase === "select_source";
  const showMediaActions = phase === "pick_thumbnail" || phase === "ready";

  if (!showSourceActions && !showMediaActions) return null;

  return (
    <div className="fb-pe-card__toolbar">
      {showSourceActions ? (
        <>
          <Tooltip content={isVideo ? "Upload video" : "Upload image"}>
            <button
              type="button"
              className="fb-pe-card__tool"
              aria-label={isVideo ? "Upload video" : "Upload image"}
              onClick={(e) => {
                e.stopPropagation();
                onQuickUpload(slide);
              }}
            >
              <UploadOne theme="outline" size="14" fill="currentColor" />
            </button>
          </Tooltip>
          <Tooltip content="Browse URL, folder, or Page video">
            <button
              type="button"
              className="fb-pe-card__tool"
              aria-label="Choose source"
              onClick={(e) => {
                e.stopPropagation();
                onChangeSourceClick(slide);
              }}
            >
              <Camera theme="outline" size="14" fill="currentColor" />
            </button>
          </Tooltip>
        </>
      ) : null}
      {showMediaActions ? (
        <>
          <Tooltip
            content={
              isVideo
                ? needsThumb
                  ? "Pick thumbnail (required)"
                  : "Change thumbnail"
                : "Replace photo"
            }
          >
            <button
              type="button"
              className={`fb-pe-card__tool ${needsThumb ? "fb-pe-card__tool--warn" : ""}`}
              aria-label={isVideo ? "Pick video thumbnail" : "Replace photo"}
              onClick={(e) => {
                e.stopPropagation();
                onPickThumbnailClick(slide);
              }}
            >
              <Pic theme="outline" size="14" fill="currentColor" />
            </button>
          </Tooltip>
          {canClearSource ? (
            <Tooltip content="Clear and start over">
              <button
                type="button"
                className="fb-pe-card__tool fb-pe-card__tool--reset"
                aria-label="Clear source"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearSourceClick(slide);
                }}
              >
                <CloseOne theme="outline" size="14" fill="currentColor" />
              </button>
            </Tooltip>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

const PeCarouselPreview: React.FC<PeCarouselPreviewProps> = ({
  pageLabel,
  pageInitial,
  caption,
  carouselSlides,
  pageVideos,
  ctaText,
  ctaButtonLabel,
  ctaOption,
  inlinePreview = false,
  showPreviewBadge = true,
  badgeLabel = "Post",
  generatingSlideIds = {},
  creatingAdSlideIds = {},
  onCardMediaClick,
  onChangeSourceClick,
  onQuickUpload,
  onPickThumbnailClick,
  onClearSourceClick,
}) => (
  <div className={inlinePreview ? "fb-pe-preview fb-pe-preview--inline" : "fb-pe-preview"}>
    {showPreviewBadge ? (
      <div className="fb-pe-preview__badge" aria-hidden>
        {badgeLabel}
      </div>
    ) : null}

    <div className="fb-pe-preview__header">
      <div className="fb-pe-preview__avatar" aria-hidden>
        {pageInitial}
      </div>
      <div className="fb-pe-preview__meta-block">
        <div className="fb-pe-preview__page">{pageLabel}</div>
        <div className="fb-pe-preview__time">Just now · Public</div>
      </div>
    </div>

    {caption.trim() ? (
      <div className="fb-pe-preview__caption">{caption}</div>
    ) : (
      <div className="fb-pe-preview__caption fb-pe-preview__caption--placeholder">
        Your caption will appear here…
      </div>
    )}

    <div className="fb-pe-preview__carousel" role="list">
      {carouselSlides.slice(0, FIXED_CAROUSEL_SLOTS).map((slide, index) => {
        const isVideo = slide.kind === "video";
        const filled = carouselSlotFilled(slide, pageVideos);
        const hasSource = carouselSlotHasSource(slide);
        const generatingThumb = Boolean(generatingSlideIds[slide.id]);
        const creatingAd = Boolean(creatingAdSlideIds[slide.id]);
        const needsThumb = videoCardNeedsThumbnail(slide, pageVideos);
        const phase = carouselSlotPipelinePhase(slide, pageVideos, generatingThumb, creatingAd);
        const canPickSource = phase === "select_source";
        const canClearSource = hasSource && !generatingThumb && !creatingAd;

        const mediaFallback = renderCarouselSlotFallback(slide, filled);
        const mediaClassName = "fb-pe-card__img";

        const mediaContent = isVideo ? (
          <CarouselSlideVideoPreview
            slide={slide}
            pageVideos={pageVideos}
            className={mediaClassName}
            fallback={mediaFallback}
            generatingThumb={generatingThumb}
          />
        ) : (
          <CarouselSlidePhotoMedia
            slide={slide}
            pageVideos={pageVideos}
            className={mediaClassName}
            fallback={mediaFallback}
          />
        );

        return (
          <article
            key={slide.id}
            role="listitem"
            className={`fb-pe-card fb-pe-card--${slide.kind} ${filled ? "fb-pe-card--filled" : "fb-pe-card--empty"} ${needsThumb ? "fb-pe-card--needs-thumb" : ""}`.trim()}
          >
            <div className="fb-pe-card__slot-label">{carouselSlotLabel(slide.kind, index)}</div>

            <SlotToolbar
              slide={slide}
              isVideo={isVideo}
              phase={phase}
              needsThumb={needsThumb}
              canClearSource={canClearSource}
              onQuickUpload={onQuickUpload}
              onChangeSourceClick={onChangeSourceClick}
              onPickThumbnailClick={onPickThumbnailClick}
              onClearSourceClick={onClearSourceClick}
            />

            {filled ? (
              <div className="fb-pe-card__media fb-pe-card__media--interactive">
                {mediaContent}
                {generatingThumb ? (
                  <span className="fb-pe-card__generating" aria-hidden>
                    <Spin size={22} />
                    <span className="fb-pe-card__generating-label">Generating thumbnails (ffmpeg)…</span>
                  </span>
                ) : creatingAd ? (
                  <span className="fb-pe-card__generating" aria-hidden>
                    <Spin size={22} />
                    <span className="fb-pe-card__generating-label">Creating Page video…</span>
                  </span>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="fb-pe-card__media"
                aria-label={`Add ${isVideo ? "video" : "photo"} for carousel card`}
                disabled={!canPickSource}
                onClick={() => {
                  if (canPickSource) onCardMediaClick(slide);
                }}
              >
                {mediaContent}
              </button>
            )}

            <div className="fb-pe-card__footer">
              <div className="fb-pe-card__cta">{ctaText}</div>
              <span className="fb-pe-card__cta-btn" aria-hidden>
                {ctaOption === "like_page" ? (
                  <Like theme="outline" size="14" fill="currentColor" />
                ) : (
                  <Plus theme="outline" size="14" fill="currentColor" />
                )}
                {ctaButtonLabel}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  </div>
);

export default PeCarouselPreview;

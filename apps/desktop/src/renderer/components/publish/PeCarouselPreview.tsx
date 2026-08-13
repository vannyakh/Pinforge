import React from "react";
import { Spin } from "@arco-design/web-react";
import { Camera, Like, Plus } from "@icon-park/react";
import {
  CarouselSlidePhotoMedia,
  CarouselSlideVideoPreview,
  carouselSlotFilled,
  renderCarouselSlotFallback,
} from "@renderer/components/publish/carouselSlideMedia";
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
  generatingSlideIds?: Record<string, boolean>;
  /** Empty card — open source modal. */
  onCardMediaClick: (slide: CarouselSlideDraft) => void;
  /** Camera control — change video/photo source. */
  onChangeSourceClick: (slide: CarouselSlideDraft) => void;
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
  generatingSlideIds = {},
  onCardMediaClick,
  onChangeSourceClick,
}) => (
  <div className={inlinePreview ? "fb-pe-preview fb-pe-preview--inline" : "fb-pe-preview"}>
    {showPreviewBadge ? (
      <div className="fb-pe-preview__badge" aria-hidden>
        Preview
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
      {carouselSlides.slice(0, FIXED_CAROUSEL_SLOTS).map((slide) => {
        const isVideo = slide.kind === "video";
        const filled = carouselSlotFilled(slide, pageVideos);
        const generatingThumb = Boolean(generatingSlideIds[slide.id]);

        const mediaFallback = renderCarouselSlotFallback(slide, filled);
        const mediaClassName = "fb-pe-card__img";

        return (
          <article
            key={slide.id}
            role="listitem"
            className={`fb-pe-card ${filled ? "fb-pe-card--filled" : "fb-pe-card--empty"}`}
          >
            {filled ? (
              <div className="fb-pe-card__media fb-pe-card__media--interactive">
                {isVideo ? (
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
                )}
                {generatingThumb ? (
                  <span className="fb-pe-card__generating" aria-hidden>
                    <Spin size={20} />
                  </span>
                ) : null}
                {!isVideo ? (
                  <button
                    type="button"
                    className="fb-pe-card__change"
                    aria-label="Change photo source"
                    onClick={() => onChangeSourceClick(slide)}
                  >
                    Change source
                  </button>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="fb-pe-card__media"
                aria-label={`Choose ${isVideo ? "video" : "photo"} source for carousel card`}
                onClick={() => onCardMediaClick(slide)}
              >
                {isVideo ? (
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
                )}
              </button>
            )}

            {filled ? (
              <button
                type="button"
                className="fb-pe-card__thumb"
                aria-label="Change source"
                title="Change source"
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeSourceClick(slide);
                }}
              >
                <Camera theme="outline" size="14" fill="currentColor" />
              </button>
            ) : null}

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

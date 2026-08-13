import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input, Select } from "@arco-design/web-react";
import { Camera, Pic, PlayOne, Plus, VideoOne } from "@icon-park/react";
import CarouselSourceModal from "@renderer/components/publish/CarouselSourceModal";
import {
  slidePreviewUrl,
  slotHasSource,
} from "@renderer/components/publish/carouselPreview";
import {
  CAROUSEL_BUTTON_ACTIONS,
  DEFAULT_PE_CARD_FOOTER,
  FIXED_CAROUSEL_SLOTS,
  useMetaPublishStore,
  type CarouselSlideDraft,
} from "@renderer/pages/publish/metaPublishStore";
import type { MetaPageVideoSummary } from "@renderer/api";

type SlidePreviewImageProps = {
  src?: string;
  alt: string;
  className: string;
  fallback: React.ReactNode;
};

const SlidePreviewImage: React.FC<SlidePreviewImageProps> = ({ src, alt, className, fallback }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
};

type PeCarouselBuilderProps = {
  pageId?: string;
  pageVideos: MetaPageVideoSummary[];
  loadingVideos: boolean;
  onRefreshVideos: () => void;
};

const SLOT_META = [
  { hint: "Left · Video", label: "Video", side: "Left" },
  { hint: "Right · Photo", label: "Photo", side: "Right" },
] as const;

const PeCarouselBuilder: React.FC<PeCarouselBuilderProps> = ({
  pageId,
  pageVideos,
  loadingVideos,
  onRefreshVideos,
}) => {
  const message = useMetaPublishStore((s) => s.message);
  const setMessage = useMetaPublishStore((s) => s.setMessage);
  const carouselSlides = useMetaPublishStore((s) => s.carouselSlides);
  const selectedSlideId = useMetaPublishStore((s) => s.selectedSlideId);
  const link = useMetaPublishStore((s) => s.link);
  const setLink = useMetaPublishStore((s) => s.setLink);
  const setSelectedSlideId = useMetaPublishStore((s) => s.setSelectedSlideId);
  const updateCarouselSlide = useMetaPublishStore((s) => s.updateCarouselSlide);

  const [buttonAction, setButtonAction] = useState<string>("like_page");
  const [ctaOption, setCtaOption] = useState<string | undefined>();
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const modalClosingRef = useRef(false);

  const selectedSlide = useMemo(
    () => carouselSlides.find((s) => s.id === selectedSlideId) ?? null,
    [carouselSlides, selectedSlideId]
  );

  const ctaText = carouselSlides[0]?.description?.trim() || DEFAULT_PE_CARD_FOOTER;
  const pageLabel = pageId ? `Page ${pageId}` : "Your Page";

  const applyCtaText = (text: string) => {
    for (const slide of carouselSlides) {
      updateCarouselSlide(slide.id, { description: text });
    }
  };

  const onButtonActionChange = (value: string) => {
    setButtonAction(value);
    const preset = CAROUSEL_BUTTON_ACTIONS.find((a) => a.value === value);
    if (preset) applyCtaText(preset.text);
  };

  const onCtaOptionChange = (value: string | undefined) => {
    setCtaOption(value);
    if (!value) return;
    const preset = CAROUSEL_BUTTON_ACTIONS.find((a) => a.value === value);
    if (preset) {
      setButtonAction(preset.value);
      applyCtaText(preset.text);
    }
  };

  const closeSourceModal = useCallback(() => {
    modalClosingRef.current = true;
    setSourceModalOpen(false);
    window.setTimeout(() => {
      modalClosingRef.current = false;
    }, 250);
  }, []);

  const openSourceModal = (slide: CarouselSlideDraft) => {
    if (modalClosingRef.current) return;
    setSelectedSlideId(slide.id);
    setSourceModalOpen(true);
  };

  const openUploadForSelected = () => {
    const target = selectedSlide ?? carouselSlides[0];
    if (target) openSourceModal(target);
  };

  const renderSlideFallback = (slide: CarouselSlideDraft, size: number) =>
    slide.kind === "video" ? (
      <VideoOne theme="outline" size={size} fill="currentColor" className="fb-pe-card__placeholder-icon" />
    ) : (
      <Pic theme="outline" size={size} fill="currentColor" className="fb-pe-card__placeholder-icon" />
    );

  return (
    <div className="post-builder flex flex-col gap-18px">
      <section className="post-builder__section">
        <div className="post-builder__label">Caption</div>
        <Input.TextArea
          value={message}
          onChange={setMessage}
          placeholder="Write the main caption above your carousel…"
          autoSize={{ minRows: 3, maxRows: 8 }}
        />
      </section>

      <section className="post-builder__section">
        <div className="post-builder__label">Button action</div>
        <Select
          value={buttonAction}
          options={CAROUSEL_BUTTON_ACTIONS.map((a) => ({ label: a.label, value: a.value }))}
          onChange={onButtonActionChange}
        />
      </section>

      <section className="post-builder__section">
        <div className="post-builder__label">CTA option</div>
        <div className="post-builder__cta-grid flex flex-col gap-8px">
          <Select
            allowClear
            placeholder="Please select CTA"
            value={ctaOption}
            options={CAROUSEL_BUTTON_ACTIONS.map((a) => ({ label: a.label, value: a.value }))}
            onChange={onCtaOptionChange}
          />
          <Input value={link} onChange={setLink} placeholder="CTA link (optional)" />
          <Input
            value={ctaText}
            onChange={(v) => applyCtaText(v)}
            placeholder={DEFAULT_PE_CARD_FOOTER}
          />
        </div>
      </section>

      <section className="post-builder__section">
        <div className="post-builder__label">Preview</div>
        <div className="fb-pe-preview">
          <div className="fb-pe-preview__header">
            <div className="fb-pe-preview__avatar" aria-hidden>
              {pageLabel.charAt(0).toUpperCase()}
            </div>
            <div className="fb-pe-preview__meta-block">
              <div className="fb-pe-preview__page">{pageLabel}</div>
              <div className="fb-pe-preview__time">Just now · Public</div>
            </div>
          </div>

          {message.trim() ? (
            <div className="fb-pe-preview__caption">{message}</div>
          ) : (
            <div className="fb-pe-preview__caption fb-pe-preview__caption--placeholder">
              Your caption will appear here…
            </div>
          )}

          <div className="fb-pe-preview__carousel">
            {carouselSlides.slice(0, FIXED_CAROUSEL_SLOTS).map((slide, index) => {
              const active = slide.id === selectedSlideId;
              const preview = slidePreviewUrl(slide, pageVideos);
              const filled = slotHasSource(slide);
              const isVideo = slide.kind === "video";
              const slotHint = SLOT_META[index]?.hint ?? slide.kind;

              return (
                <button
                  key={slide.id}
                  type="button"
                  className={`fb-pe-card ${active ? "fb-pe-card--active" : ""} ${filled ? "fb-pe-card--filled" : "fb-pe-card--empty"}`}
                  onClick={() => openSourceModal(slide)}
                >
                  <div className="fb-pe-card__media">
                    <SlidePreviewImage
                      src={preview}
                      alt=""
                      className="fb-pe-card__img"
                      fallback={renderSlideFallback(slide, 32)}
                    />
                    {isVideo && filled ? (
                      <span className="fb-pe-card__play" aria-hidden>
                        <PlayOne theme="filled" size="28" fill="currentColor" />
                      </span>
                    ) : null}
                    {!filled ? (
                      <span className="fb-pe-card__add" aria-hidden>
                        <Plus theme="outline" size="16" fill="currentColor" />
                      </span>
                    ) : null}
                  </div>
                  <div className="fb-pe-card__cta">
                    {filled
                      ? slide.description?.trim() || DEFAULT_PE_CARD_FOOTER
                      : `Add ${isVideo ? "video" : "photo"}`}
                  </div>
                  <div className="fb-pe-card__slot">{slotHint}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="post-builder__section">
        <div className="post-builder__label">Image</div>
        <div className="post-builder__thumb-strip">
          <button
            type="button"
            className="post-builder__upload-tile shrink-0"
            onClick={openUploadForSelected}
          >
            <Camera theme="outline" size="22" fill="currentColor" />
            <span>
              Upload your{" "}
              {selectedSlide?.kind === "video" ? "video" : "photo"}
            </span>
          </button>

          {carouselSlides.slice(0, FIXED_CAROUSEL_SLOTS).map((slide, index) => {
            const active = slide.id === selectedSlideId;
            const preview = slidePreviewUrl(slide, pageVideos);
            const filled = slotHasSource(slide);
            const isVideo = slide.kind === "video";
            const meta = SLOT_META[index];

            return (
              <button
                key={`thumb-${slide.id}`}
                type="button"
                className={`post-builder__thumb-tile shrink-0 ${active ? "is-active" : ""} ${filled ? "is-filled" : "is-empty"}`}
                onClick={() => setSelectedSlideId(slide.id)}
                onDoubleClick={() => openSourceModal(slide)}
              >
                <div className="post-builder__thumb-tile__media">
                  <SlidePreviewImage
                    src={preview}
                    alt=""
                    className="post-builder__thumb-tile__img"
                    fallback={renderSlideFallback(slide, 28)}
                  />
                  {isVideo && filled ? (
                    <span className="post-builder__thumb-tile__play" aria-hidden>
                      <PlayOne theme="filled" size="22" fill="currentColor" />
                    </span>
                  ) : null}
                  {!filled ? (
                    <span className="post-builder__thumb-tile__add" aria-hidden>
                      <Plus theme="outline" size="14" fill="currentColor" />
                    </span>
                  ) : null}
                </div>
                <div className="post-builder__thumb-tile__footer truncate">
                  {filled
                    ? slide.description?.trim() || DEFAULT_PE_CARD_FOOTER
                    : `Add ${isVideo ? "video" : "photo"}`}
                </div>
                <div className="post-builder__thumb-tile__slot">{meta?.hint}</div>
              </button>
            );
          })}
        </div>
      </section>

      <CarouselSourceModal
        visible={sourceModalOpen}
        slide={selectedSlide}
        pageVideos={pageVideos}
        loadingVideos={loadingVideos}
        onRefreshVideos={onRefreshVideos}
        onClose={closeSourceModal}
        onApply={(patch) => {
          if (!selectedSlide) return;
          updateCarouselSlide(selectedSlide.id, patch);
        }}
      />

      <div className="text-12px text-t-tertiary">
        Video (left) and photo (right) · click a card to select or upload · both required to publish
      </div>
    </div>
  );
};

export default PeCarouselBuilder;

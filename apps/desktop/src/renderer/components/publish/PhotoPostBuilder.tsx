import React, { useMemo, useState } from "react";
import { Input, Select } from "@arco-design/web-react";
import { Plus, UploadOne } from "@icon-park/react";
import MetaPhotoAlbumTarget from "@renderer/components/publish/MetaPhotoAlbumTarget";
import PostBuilderLabelHelp from "@renderer/components/publish/PostBuilderLabelHelp";
import CarouselSourceModal from "@renderer/components/publish/CarouselSourceModal";
import { pathToPreview } from "@renderer/components/publish/carouselPreview";
import type { MetaPhotoPostMode } from "@common/publish/types";
import {
  CAROUSEL_BUTTON_ACTIONS,
  MAX_PHOTO_CAROUSEL,
  META_PHOTO_POST_MODE_LABELS,
  MIN_PHOTO_CAROUSEL,
  useMetaPublishStore,
  type CarouselSlideDraft,
} from "@renderer/pages/publish/metaPublishStore";

const PHOTO_MODE_OPTIONS: MetaPhotoPostMode[] = ["single", "album", "carousel"];

type PhotoPostBuilderProps = {
  metaConnected?: boolean;
};

const PhotoPostBuilder: React.FC<PhotoPostBuilderProps> = ({ metaConnected = false }) => {
  const photoPostMode = useMetaPublishStore((s) => s.photoPostMode);
  const setPhotoPostMode = useMetaPublishStore((s) => s.setPhotoPostMode);
  const photoCarouselSlides = useMetaPublishStore((s) => s.photoCarouselSlides);
  const selectedSlideId = useMetaPublishStore((s) => s.selectedSlideId);
  const setSelectedSlideId = useMetaPublishStore((s) => s.setSelectedSlideId);
  const addPhotoCarouselSlide = useMetaPublishStore((s) => s.addPhotoCarouselSlide);
  const updatePhotoCarouselSlide = useMetaPublishStore((s) => s.updatePhotoCarouselSlide);
  const removePhotoCarouselSlide = useMetaPublishStore((s) => s.removePhotoCarouselSlide);
  const link = useMetaPublishStore((s) => s.link);
  const setLink = useMetaPublishStore((s) => s.setLink);
  const carouselCtaOption = useMetaPublishStore((s) => s.carouselCtaOption);
  const setCarouselCtaOption = useMetaPublishStore((s) => s.setCarouselCtaOption);

  const [sourceModalOpen, setSourceModalOpen] = useState(false);

  const selectedSlide = useMemo(
    () => photoCarouselSlides.find((s) => s.id === selectedSlideId) ?? null,
    [photoCarouselSlides, selectedSlideId]
  );

  const openCarouselSource = (slide: CarouselSlideDraft) => {
    setSelectedSlideId(slide.id);
    setSourceModalOpen(true);
  };

  const photoFormatHint =
    photoPostMode === "single"
      ? "One image published via Page photos API."
      : photoPostMode === "album"
        ? "Add images in the preview grid below (Meta: JPEG/PNG/GIF/BMP/TIFF, 2–10 photos, max 10MB each)."
        : "Link carousel ad post with 2–5 image cards via child_attachments.";

  return (
    <>
      <section className="post-builder__section">
        <PostBuilderLabelHelp label="Photo format" hint={photoFormatHint} />
        <Select
          value={photoPostMode}
          onChange={(v) => setPhotoPostMode(v as MetaPhotoPostMode)}
          options={PHOTO_MODE_OPTIONS.map((mode) => ({
            label: META_PHOTO_POST_MODE_LABELS[mode],
            value: mode,
          }))}
        />
      </section>

      {photoPostMode === "album" ? <MetaPhotoAlbumTarget connected={metaConnected} /> : null}

      {photoPostMode === "carousel" ? (
        <>
          <section className="post-builder__section">
            <PostBuilderLabelHelp
              label="Landing link"
              hint="Required external URL for all carousel cards. Facebook and Instagram links are rejected by Meta (error 1609011)."
            />
            <Input
              value={link}
              onChange={setLink}
              allowClear
              placeholder="https://your-website.com (required)"
            />
          </section>
          <section className="post-builder__section">
            <PostBuilderLabelHelp
              label="CTA option"
              hint="Applied in the post preview. Organic Page feed posts do not send call_to_action to the Graph API."
            />
            <Select
              value={carouselCtaOption}
              options={CAROUSEL_BUTTON_ACTIONS.map((a) => ({ label: a.label, value: a.value }))}
              onChange={(v) => setCarouselCtaOption(v as typeof carouselCtaOption)}
            />
          </section>
          <section className="post-builder__section">
            <div className="post-builder__section-head">
              <div className="post-builder__label mb-0">
                Carousel cards ({photoCarouselSlides.length}/{MAX_PHOTO_CAROUSEL})
              </div>
              <button
                type="button"
                className="post-builder__caption-suggest-add"
                title="Add card"
                aria-label="Add card"
                disabled={photoCarouselSlides.length >= MAX_PHOTO_CAROUSEL}
                onClick={addPhotoCarouselSlide}
              >
                <Plus theme="outline" size="16" fill="currentColor" />
              </button>
            </div>
            <div className="photo-post-builder__carousel-grid">
              {photoCarouselSlides.map((slide, index) => (
                <div key={slide.id} className="photo-post-builder__carousel-card">
                  <button
                    type="button"
                    className="photo-post-builder__carousel-media"
                    onClick={() => openCarouselSource(slide)}
                  >
                    {slide.filePath?.trim() ? (
                      <img
                        src={slide.previewUrl ?? pathToPreview(slide.filePath.trim())}
                        alt=""
                        className="photo-post-builder__carousel-img"
                      />
                    ) : (
                      <span className="photo-post-builder__carousel-empty">
                        <UploadOne theme="outline" size="22" fill="currentColor" />
                        <span>Card {index + 1}</span>
                      </span>
                    )}
                  </button>
                  {photoCarouselSlides.length > MIN_PHOTO_CAROUSEL ? (
                    <button
                      type="button"
                      className="photo-post-builder__carousel-remove"
                      aria-label="Remove card"
                      onClick={() => removePhotoCarouselSlide(slide.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <CarouselSourceModal
        visible={sourceModalOpen}
        slide={selectedSlide}
        pageVideos={[]}
        variant="post"
        onClose={() => setSourceModalOpen(false)}
        onApply={(patch) => {
          if (!selectedSlide) return;
          const filePath = patch.filePath?.trim();
          if (!filePath) return;
          updatePhotoCarouselSlide(selectedSlide.id, {
            ...patch,
            filePath,
            previewUrl: pathToPreview(filePath),
          });
          setSourceModalOpen(false);
        }}
      />
    </>
  );
};

export default PhotoPostBuilder;

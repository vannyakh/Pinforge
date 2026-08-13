import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input, Message, Select } from "@arco-design/web-react";
import CarouselSourceModal from "@renderer/components/publish/CarouselSourceModal";
import CarouselThumbnailModal from "@renderer/components/publish/CarouselThumbnailModal";
import PeCarouselPreview from "@renderer/components/publish/PeCarouselPreview";
import PostBuilderLabelHelp from "@renderer/components/publish/PostBuilderLabelHelp";
import PublishCaptionSection from "@renderer/components/publish/PublishCaptionSection";
import PublishHashtagSection from "@renderer/components/publish/PublishHashtagSection";
import { buildPublishMessage } from "@renderer/components/publish/publishComposeMessage";
import {
  slotHasSource,
  previewUrlForLocalPath,
  pathToPreview,
} from "@renderer/components/publish/carouselPreview";
import {
  customThumbnailFromPath,
  DEFAULT_PHOTO_CARD_FILE,
  generatedVideoThumbnailAssets,
  PRESET_CAROUSEL_THUMBNAILS,
  thumbnailMatchesSlide,
  type CarouselThumbnailAsset,
} from "@renderer/components/publish/carouselThumbnailAssets";
import {
  CAROUSEL_BUTTON_ACTIONS,
  DEFAULT_PE_CARD_FOOTER,
  useMetaPublishStore,
  type CarouselSlideDraft,
} from "@renderer/pages/publish/metaPublishStore";
import { api, type MetaPageVideoSummary } from "@renderer/api";

function fileBaseName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? filePath;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

type PeCarouselBuilderProps = {
  pageId?: string;
  pageName?: string;
  /** Flat layout on the publish page (no boxed modal-style shell). */
  inlinePreview?: boolean;
  pageVideos: MetaPageVideoSummary[];
  loadingVideos: boolean;
  onRefreshVideos: () => void;
};

const PE_CTA_HINT =
  "Required external landing link for all carousel cards (https://your-site.com). Facebook and Instagram URLs are not eligible.";

const PeCarouselBuilder: React.FC<PeCarouselBuilderProps> = ({
  pageId,
  pageName,
  inlinePreview = false,
  pageVideos,
  loadingVideos: _loadingVideos,
  onRefreshVideos: _onRefreshVideos,
}) => {
  const message = useMetaPublishStore((s) => s.message);
  const hashtags = useMetaPublishStore((s) => s.hashtags);
  const carouselSlides = useMetaPublishStore((s) => s.carouselSlides);
  const selectedSlideId = useMetaPublishStore((s) => s.selectedSlideId);
  const link = useMetaPublishStore((s) => s.link);
  const carouselCtaOption = useMetaPublishStore((s) => s.carouselCtaOption);
  const setLink = useMetaPublishStore((s) => s.setLink);
  const setCarouselCtaOption = useMetaPublishStore((s) => s.setCarouselCtaOption);
  const setSelectedSlideId = useMetaPublishStore((s) => s.setSelectedSlideId);
  const updateCarouselSlide = useMetaPublishStore((s) => s.updateCarouselSlide);

  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [thumbnailModalSlideId, setThumbnailModalSlideId] = useState<string | null>(null);
  const [customThumbnails, setCustomThumbnails] = useState<CarouselThumbnailAsset[]>([]);
  const [generatedThumbsBySlide, setGeneratedThumbsBySlide] = useState<
    Record<string, CarouselThumbnailAsset[]>
  >({});
  const [generatingSlideIds, setGeneratingSlideIds] = useState<Record<string, boolean>>({});
  const thumbQueueRef = useRef(new Set<string>());

  const selectedSlide = useMemo(
    () => carouselSlides.find((s) => s.id === selectedSlideId) ?? null,
    [carouselSlides, selectedSlideId]
  );

  const thumbnailModalSlide = useMemo(
    () => carouselSlides.find((s) => s.id === thumbnailModalSlideId) ?? null,
    [carouselSlides, thumbnailModalSlideId]
  );

  const ctaPreset = CAROUSEL_BUTTON_ACTIONS.find((a) => a.value === carouselCtaOption);
  const ctaText = carouselSlides[0]?.description?.trim() || ctaPreset?.text || DEFAULT_PE_CARD_FOOTER;
  const ctaButtonLabel = ctaPreset?.label ?? DEFAULT_PE_CARD_FOOTER;
  const pageLabel = pageName?.trim() || (pageId ? `Page ${pageId}` : "Your Page");
  const pageInitial = pageLabel.charAt(0).toUpperCase();
  const previewMessage = buildPublishMessage(message, hashtags);

  const libraryThumbnails = useMemo(
    () => [...PRESET_CAROUSEL_THUMBNAILS, ...customThumbnails],
    [customThumbnails]
  );

  const applyCtaText = (text: string, ctaType?: string) => {
    for (const slide of carouselSlides) {
      updateCarouselSlide(slide.id, {
        description: text,
        ...(ctaType ? { callToActionType: ctaType } : {}),
      });
    }
  };

  const onCtaOptionChange = (value: string | undefined) => {
    const next = (value ?? "like_page") as (typeof CAROUSEL_BUTTON_ACTIONS)[number]["value"];
    setCarouselCtaOption(next);
    const preset = CAROUSEL_BUTTON_ACTIONS.find((a) => a.value === next);
    if (preset) applyCtaText(preset.text, preset.ctaType);
  };

  const modalClosingRef = useRef(false);

  const closeSourceModal = useCallback(() => {
    modalClosingRef.current = true;
    setSourceModalOpen(false);
    window.setTimeout(() => {
      modalClosingRef.current = false;
    }, 250);
  }, []);

  const autoGenerateVideoThumbnails = useCallback(
    async (slideId: string, videoPath: string) => {
      setGeneratingSlideIds((prev) => ({ ...prev, [slideId]: true }));
      try {
        const paths = await api.generateVideoThumbnails(videoPath);
        const assets = generatedVideoThumbnailAssets(paths);
        setGeneratedThumbsBySlide((prev) => ({ ...prev, [slideId]: assets }));
        setCustomThumbnails((prev) => {
          const next = [...prev];
          for (const asset of assets) {
            if (!next.some((t) => t.id === asset.id)) next.push(asset);
          }
          return next;
        });

        const slide = carouselSlides.find((s) => s.id === slideId);
        if (slide?.kind === "video" && !slide.videoThumbnailPath?.trim() && paths[0]) {
          const first = paths[0]!;
          updateCarouselSlide(slideId, {
            videoThumbnailPath: first,
            previewUrl: previewUrlForLocalPath(first, "photo") ?? pathToPreview(first),
          });
        }
      } catch (err) {
        Message.warning(err instanceof Error ? err.message : String(err));
      } finally {
        setGeneratingSlideIds((prev) => {
          const next = { ...prev };
          delete next[slideId];
          return next;
        });
      }
    },
    [carouselSlides, updateCarouselSlide]
  );

  useEffect(() => {
    for (const slide of carouselSlides) {
      if (slide.kind !== "video") continue;
      const filePath = slide.filePath?.trim();
      if (!filePath) continue;
      if (slide.videoThumbnailPath?.trim()) continue;
      if (generatedThumbsBySlide[slide.id]?.length) continue;
      if (generatingSlideIds[slide.id]) continue;
      if (thumbQueueRef.current.has(slide.id)) continue;

      thumbQueueRef.current.add(slide.id);
      void autoGenerateVideoThumbnails(slide.id, filePath).finally(() => {
        thumbQueueRef.current.delete(slide.id);
      });
    }
  }, [autoGenerateVideoThumbnails, carouselSlides, generatedThumbsBySlide, generatingSlideIds]);

  useEffect(() => {
    const photoSlide = carouselSlides.find((s) => s.kind === "photo");
    if (!photoSlide || photoSlide.filePath?.trim()) return;

    let cancelled = false;
    void api.resolveThumbnailPath(DEFAULT_PHOTO_CARD_FILE).then((path) => {
      if (cancelled || !path) return;
      updateCarouselSlide(photoSlide.id, {
        filePath: path,
        previewUrl: pathToPreview(path),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [carouselSlides, updateCarouselSlide]);

  const openSourceModal = (slide: CarouselSlideDraft) => {
    if (modalClosingRef.current) return;
    setSelectedSlideId(slide.id);
    setSourceModalOpen(true);
  };

  const applyImageToSlide = useCallback(
    (slideId: string, filePath: string, previewUrl: string) => {
      const name = fileBaseName(filePath).replace(/\.[^.]+$/, "");
      updateCarouselSlide(slideId, {
        kind: "photo",
        filePath,
        previewUrl,
        pageVideoId: undefined,
        name,
      });
    },
    [updateCarouselSlide]
  );

  const applyThumbnailToSlide = useCallback(
    async (slide: CarouselSlideDraft, thumb: CarouselThumbnailAsset) => {
      let filePath = thumb.id.startsWith("custom:") ? thumb.id.slice("custom:".length) : null;
      if (!filePath) {
        filePath = await api.resolveThumbnailPath(thumb.fileName);
      }
      if (!filePath) {
        Message.error(`Could not resolve thumbnail: ${thumb.fileName}`);
        return;
      }

      const preview =
        thumb.previewUrl || previewUrlForLocalPath(filePath, "photo") || pathToPreview(filePath);

      if (slide.kind === "video") {
        if (!slotHasSource(slide)) {
          Message.info("Add a video source first, then pick a thumbnail.");
          return;
        }
        updateCarouselSlide(slide.id, {
          videoThumbnailPath: filePath,
          previewUrl: preview,
        });
        setSelectedSlideId(slide.id);
        setThumbnailModalOpen(false);
        return;
      }

      applyImageToSlide(slide.id, filePath, preview);
      setSelectedSlideId(slide.id);
      setThumbnailModalOpen(false);
    },
    [applyImageToSlide, setSelectedSlideId, updateCarouselSlide]
  );

  const openThumbnailModal = (slide: CarouselSlideDraft) => {
    setSelectedSlideId(slide.id);
    setThumbnailModalSlideId(slide.id);
    setThumbnailModalOpen(true);
  };

  const closeThumbnailModal = () => {
    setThumbnailModalOpen(false);
    setThumbnailModalSlideId(null);
  };

  const handleUploadForSlide = async (slide: CarouselSlideDraft) => {
    if (slide.kind === "video") {
      if (!slotHasSource(slide)) {
        closeThumbnailModal();
        openSourceModal(slide);
        return;
      }

      const path = await api.pickMediaFile();
      if (!path || !IMAGE_EXT.test(path)) {
        if (path) Message.warning("Choose an image file for the video thumbnail.");
        return;
      }

      const custom = customThumbnailFromPath(path);
      setCustomThumbnails((prev) =>
        prev.some((t) => t.id === custom.id) ? prev : [...prev, custom]
      );
      updateCarouselSlide(slide.id, {
        videoThumbnailPath: path,
        previewUrl: previewUrlForLocalPath(path, "photo") ?? custom.previewUrl,
      });
      setSelectedSlideId(slide.id);
      closeThumbnailModal();
      return;
    }

    const path = await api.pickMediaFile();
    if (!path || !IMAGE_EXT.test(path)) {
      if (path) Message.warning("Choose an image file for the photo card.");
      return;
    }

    const custom = customThumbnailFromPath(path);
    setCustomThumbnails((prev) =>
      prev.some((t) => t.id === custom.id) ? prev : [...prev, custom]
    );
    applyImageToSlide(
      slide.id,
      path,
      previewUrlForLocalPath(path, "photo") ?? custom.previewUrl
    );
    setSelectedSlideId(slide.id);
    closeThumbnailModal();
  };

  return (
    <div className="post-builder flex flex-col gap-18px">
      <PublishCaptionSection placeholder="Write the main caption above your carousel…" />
      <PublishHashtagSection />

      <section className="post-builder__section">
        <PostBuilderLabelHelp label="CTA option" hint={PE_CTA_HINT} />
        <div className="post-builder__cta-grid flex flex-col gap-8px">
          <Select
            value={carouselCtaOption}
            options={CAROUSEL_BUTTON_ACTIONS.map((a) => ({ label: a.label, value: a.value }))}
            onChange={onCtaOptionChange}
          />
          <Input
            value={link}
            onChange={setLink}
            allowClear
            placeholder="https://your-website.com (required for carousel)"
          />
          <Input
            value={ctaText}
            onChange={(v) => applyCtaText(v)}
            placeholder={DEFAULT_PE_CARD_FOOTER}
          />
        </div>
      </section>

      <section className="post-builder__section post-builder__section--flush">
        <PeCarouselPreview
          pageLabel={pageLabel}
          pageInitial={pageInitial}
          caption={previewMessage}
          carouselSlides={carouselSlides}
          pageVideos={pageVideos}
          ctaText={ctaText}
          ctaButtonLabel={ctaButtonLabel}
          ctaOption={carouselCtaOption}
          inlinePreview={inlinePreview}
          generatingSlideIds={generatingSlideIds}
          onCardMediaClick={openSourceModal}
          onChangeSourceClick={openSourceModal}
        />
      </section>

      <CarouselSourceModal
        visible={sourceModalOpen}
        slide={selectedSlide}
        pageVideos={pageVideos}
        onClose={closeSourceModal}
        onApply={(patch) => {
          if (!selectedSlide) return;
          updateCarouselSlide(selectedSlide.id, patch);
        }}
      />

      <CarouselThumbnailModal
        visible={thumbnailModalOpen}
        slide={thumbnailModalSlide}
        libraryThumbnails={libraryThumbnails}
        generatedThumbnails={
          thumbnailModalSlideId ? (generatedThumbsBySlide[thumbnailModalSlideId] ?? []) : []
        }
        generating={thumbnailModalSlideId ? Boolean(generatingSlideIds[thumbnailModalSlideId]) : false}
        isApplied={(thumb) =>
          thumbnailModalSlide
            ? thumbnailMatchesSlide(
                thumb,
                thumbnailModalSlide.filePath,
                thumbnailModalSlide.videoThumbnailPath
              )
            : false
        }
        onClose={closeThumbnailModal}
        onPick={(thumb) => {
          if (!thumbnailModalSlide) return;
          void applyThumbnailToSlide(thumbnailModalSlide, thumb);
        }}
        onUpload={() => {
          if (!thumbnailModalSlide) return;
          void handleUploadForSlide(thumbnailModalSlide);
        }}
      />
    </div>
  );
};

export default PeCarouselBuilder;

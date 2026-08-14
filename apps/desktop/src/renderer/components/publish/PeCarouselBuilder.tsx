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
  carouselSlotHasSource,
  peCarouselMediaSetupReady,
  validateCarouselImagePick,
  validateCarouselThumbnailPick,
  validateCarouselVideoPick,
  videoCardNeedsThumbnail,
} from "@renderer/components/publish/carouselMediaTypes";
import {
  customThumbnailFromPath,
  DEFAULT_PHOTO_CARD_FILE,
  generatedVideoThumbnailAssets,
  PRESET_CAROUSEL_THUMBNAILS,
  thumbnailMatchesSlide,
  type CarouselThumbnailAsset,
} from "@renderer/components/publish/carouselThumbnailAssets";
import {
  carouselLandingLinkIssue,
  carouselCaptionLinkIssue,
} from "@common/publish/carouselLinks";
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

type PeCarouselBuilderProps = {
  pageId?: string;
  pageName?: string;
  inlinePreview?: boolean;
  pageVideos: MetaPageVideoSummary[];
  loadingVideos: boolean;
  onRefreshVideos: () => void;
};

const PE_CTA_HINT =
  "Optional landing link for carousel cards. Leave empty to use your Page URL. Facebook and Instagram URLs are not eligible when set manually.";

const PE_POST_HINT =
  "Step 2 — select video source, upload as Page video, then ffmpeg generates thumbnails. Caption and CTA unlock when both cards are ready.";

const PeCarouselBuilder: React.FC<PeCarouselBuilderProps> = ({
  pageId,
  pageName,
  inlinePreview = false,
  pageVideos,
  loadingVideos,
  onRefreshVideos,
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
  const setCarouselCreatingAdIds = useMetaPublishStore((s) => s.setCarouselCreatingAdIds);
  const setCarouselGeneratingThumbIds = useMetaPublishStore((s) => s.setCarouselGeneratingThumbIds);

  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [thumbnailModalSlideId, setThumbnailModalSlideId] = useState<string | null>(null);
  const [customThumbnails, setCustomThumbnails] = useState<CarouselThumbnailAsset[]>([]);
  const [generatedThumbsBySlide, setGeneratedThumbsBySlide] = useState<
    Record<string, CarouselThumbnailAsset[]>
  >({});
  const [generatingSlideIds, setGeneratingSlideIds] = useState<Record<string, boolean>>({});
  const [creatingAdSlideIds, setCreatingAdSlideIds] = useState<Record<string, boolean>>({});
  const thumbQueueRef = useRef(new Set<string>());
  const adQueueRef = useRef(new Set<string>());

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
  const landingLinkIssue = carouselLandingLinkIssue(link);
  const captionLinkIssue = carouselCaptionLinkIssue(message, hashtags);

  const mediaSetupReady = useMemo(
    () =>
      peCarouselMediaSetupReady(
        carouselSlides,
        pageVideos,
        generatingSlideIds,
        creatingAdSlideIds
      ),
    [carouselSlides, pageVideos, generatingSlideIds, creatingAdSlideIds]
  );

  const videoReadyForPhoto = useMemo(() => {
    const video = carouselSlides.find((s) => s.kind === "video");
    if (!video) return false;
    if (generatingSlideIds[video.id]) return false;
    if (creatingAdSlideIds[video.id]) return false;
    if (!carouselSlotHasSource(video)) return false;
    if (video.filePath?.trim() && !video.pageVideoId?.trim()) return false;
    return !videoCardNeedsThumbnail(video, pageVideos);
  }, [carouselSlides, creatingAdSlideIds, generatingSlideIds, pageVideos]);

  useEffect(() => {
    setCarouselCreatingAdIds(creatingAdSlideIds);
  }, [creatingAdSlideIds, setCarouselCreatingAdIds]);

  useEffect(() => {
    setCarouselGeneratingThumbIds(generatingSlideIds);
  }, [generatingSlideIds, setCarouselGeneratingThumbIds]);

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

  const prepareLocalVideoSlide = useCallback(
    async (slideId: string, filePath: string, name?: string) => {
      if (!pageId) {
        Message.warning("Select a Facebook Page before uploading video.");
        return;
      }
      setCreatingAdSlideIds((prev) => ({ ...prev, [slideId]: true }));
      try {
        const result = await api.uploadCarouselDraftVideo({
          filePath,
          title: name?.trim() || fileBaseName(filePath).replace(/\.[^.]+$/, ""),
        });
        if (!result.ok || !result.videoId) {
          Message.error(result.message);
          return;
        }
        updateCarouselSlide(slideId, { pageVideoId: result.videoId });
        onRefreshVideos();
      } catch (err) {
        Message.error(err instanceof Error ? err.message : String(err));
      } finally {
        setCreatingAdSlideIds((prev) => {
          const next = { ...prev };
          delete next[slideId];
          return next;
        });
      }
    },
    [onRefreshVideos, pageId, updateCarouselSlide]
  );

  useEffect(() => {
    for (const slide of carouselSlides) {
      if (slide.kind !== "video") continue;
      const filePath = slide.filePath?.trim();
      if (!filePath) continue;
      if (slide.pageVideoId?.trim()) continue;
      if (creatingAdSlideIds[slide.id]) continue;
      if (adQueueRef.current.has(slide.id)) continue;

      adQueueRef.current.add(slide.id);
      void prepareLocalVideoSlide(slide.id, filePath, slide.name).finally(() => {
        adQueueRef.current.delete(slide.id);
      });
    }
  }, [carouselSlides, creatingAdSlideIds, prepareLocalVideoSlide]);

  useEffect(() => {
    for (const slide of carouselSlides) {
      if (slide.kind !== "video") continue;
      const filePath = slide.filePath?.trim();
      if (!filePath) continue;
      if (slide.filePath?.trim() && !slide.pageVideoId?.trim()) continue;
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
    if (!videoReadyForPhoto) return;
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
  }, [carouselSlides, updateCarouselSlide, videoReadyForPhoto]);

  const resetSlideSource = useCallback(
    (slide: CarouselSlideDraft) => {
      updateCarouselSlide(slide.id, {
        pageVideoId: undefined,
        filePath: undefined,
        previewUrl: undefined,
        videoThumbnailPath: undefined,
        name: undefined,
      });
      setGeneratedThumbsBySlide((prev) => {
        const next = { ...prev };
        delete next[slide.id];
        return next;
      });
      setGeneratingSlideIds((prev) => {
        if (!prev[slide.id]) return prev;
        const next = { ...prev };
        delete next[slide.id];
        return next;
      });
      setCreatingAdSlideIds((prev) => {
        if (!prev[slide.id]) return prev;
        const next = { ...prev };
        delete next[slide.id];
        return next;
      });
      thumbQueueRef.current.delete(slide.id);
      adQueueRef.current.delete(slide.id);
      setSelectedSlideId(slide.id);
    },
    [setSelectedSlideId, updateCarouselSlide]
  );

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

  const applyVideoToSlide = useCallback(
    (slideId: string, filePath: string) => {
      updateCarouselSlide(slideId, {
        kind: "video",
        filePath,
        previewUrl: pathToPreview(filePath),
        pageVideoId: undefined,
        videoThumbnailPath: undefined,
      });
    },
    [updateCarouselSlide]
  );

  const quickUploadForSlide = useCallback(
    async (slide: CarouselSlideDraft) => {
      setSelectedSlideId(slide.id);

      if (slide.kind === "video") {
        const paths = await api.pickMediaFiles();
        const path = paths[0];
        if (!path) return;
        const err = validateCarouselVideoPick(path);
        if (err) {
          Message.warning(err);
          return;
        }
        applyVideoToSlide(slide.id, path);
        return;
      }

      const paths = await api.pickImageFiles();
      const path = paths[0];
      if (!path) return;
      const err = validateCarouselImagePick(path);
      if (err) {
        Message.warning(err);
        return;
      }
      applyImageToSlide(
        slide.id,
        path,
        previewUrlForLocalPath(path, "photo") ?? pathToPreview(path)
      );
    },
    [applyImageToSlide, applyVideoToSlide, setSelectedSlideId]
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

      const thumbErr = validateCarouselThumbnailPick(filePath);
      if (thumbErr) {
        Message.warning(thumbErr);
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
    if (creatingAdSlideIds[slide.id]) {
      Message.info("Wait for the Page video upload to finish.");
      return;
    }
    if (generatingSlideIds[slide.id]) {
      Message.info("Wait for thumbnail generation to finish.");
      return;
    }
    if (slide.kind === "video" && !slotHasSource(slide)) {
      openSourceModal(slide);
      return;
    }
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
      const paths = await api.pickImageFiles();
      const path = paths[0];
      if (!path) return;
      const err = validateCarouselThumbnailPick(path);
      if (err) {
        Message.warning(err);
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

    const paths = await api.pickImageFiles();
    const path = paths[0];
    if (!path) return;
    const err = validateCarouselImagePick(path);
    if (err) {
      Message.warning(err);
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
      <section className="post-builder__section post-builder__section--flush">
        <PostBuilderLabelHelp label="Post" hint={PE_POST_HINT} />
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
          badgeLabel="Post"
          generatingSlideIds={generatingSlideIds}
          creatingAdSlideIds={creatingAdSlideIds}
          onCardMediaClick={openSourceModal}
          onChangeSourceClick={openSourceModal}
          onQuickUpload={(slide) => void quickUploadForSlide(slide)}
          onPickThumbnailClick={openThumbnailModal}
          onClearSourceClick={resetSlideSource}
        />
      </section>

      <fieldset
        disabled={!mediaSetupReady}
        className={`post-builder__setup-fieldset ${mediaSetupReady ? "" : "post-builder__setup-fieldset--locked"}`.trim()}
      >
        <PublishCaptionSection placeholder="Write the main caption above your carousel…" />
        {captionLinkIssue ? (
          <div className="post-builder__field-error text-12px text-[rgb(var(--danger-6))] -mt-10px">
            {captionLinkIssue}
          </div>
        ) : null}
        <PublishHashtagSection />

        <section className="post-builder__section">
          <PostBuilderLabelHelp label="Carousel options" hint={PE_CTA_HINT} />
          <div className="post-builder__cta-grid flex flex-col gap-10px">
            <div className="post-builder__field">
              <div className="post-builder__field-label">Button type</div>
              <Select
                value={carouselCtaOption}
                options={CAROUSEL_BUTTON_ACTIONS.map((a) => ({ label: a.label, value: a.value }))}
                onChange={onCtaOptionChange}
              />
            </div>
            <div className="post-builder__field">
              <div className="post-builder__field-label">Landing link (optional)</div>
              <Input
                value={link}
                onChange={setLink}
                allowClear
                status={landingLinkIssue ? "error" : undefined}
                placeholder="Leave empty for Page URL, or https://your-website.com"
              />
              {landingLinkIssue ? (
                <div className="post-builder__field-error text-12px text-[rgb(var(--danger-6))]">
                  {landingLinkIssue}
                </div>
              ) : null}
            </div>
            <div className="post-builder__field">
              <div className="post-builder__field-label">Card footer text</div>
              <Input
                value={ctaText}
                onChange={(v) => applyCtaText(v)}
                placeholder={DEFAULT_PE_CARD_FOOTER}
              />
            </div>
          </div>
        </section>
      </fieldset>

      <CarouselSourceModal
        visible={sourceModalOpen}
        slide={selectedSlide}
        pageVideos={pageVideos}
        loadingPageVideos={loadingVideos}
        onClose={closeSourceModal}
        onApply={(patch) => {
          if (!selectedSlide) return;
          if (selectedSlide.kind === "video" && patch.filePath?.trim()) {
            const err = validateCarouselVideoPick(patch.filePath);
            if (err) {
              Message.warning(err);
              return;
            }
          }
          if (selectedSlide.kind === "photo" && patch.filePath?.trim()) {
            const err = validateCarouselImagePick(patch.filePath);
            if (err) {
              Message.warning(err);
              return;
            }
          }
          updateCarouselSlide(selectedSlide.id, patch);
          closeSourceModal();
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

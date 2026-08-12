import React, { useMemo } from "react";
import { Button, Input, Select } from "@arco-design/web-react";
import { Delete, Left, Pic, Right, VideoOne } from "@icon-park/react";
import { api, type MetaPageVideoSummary } from "@renderer/api";
import {
  DEFAULT_PE_CARD_FOOTER,
  useMetaPublishStore,
  type CarouselSlideDraft,
} from "@renderer/pages/publish/metaPublishStore";

const MIN_CAROUSEL = 2;
const MAX_CAROUSEL = 5;

function pathToPreview(filePath: string): string {
  return `pinmedia://${encodeURIComponent(filePath.replace(/\\/g, "/"))}`;
}

function slideLabel(slide: CarouselSlideDraft): string {
  if (slide.name?.trim()) return slide.name.trim();
  if (slide.filePath) return slide.filePath.split(/[/\\]/).pop() ?? "Card";
  if (slide.pageVideoId) return `Video ${slide.pageVideoId}`;
  return slide.kind === "video" ? "Video" : "Photo";
}

type PeCarouselBuilderProps = {
  pageId?: string;
  pageVideos: MetaPageVideoSummary[];
  loadingVideos: boolean;
  onRefreshVideos: () => void;
};

const PeCarouselBuilder: React.FC<PeCarouselBuilderProps> = ({
  pageId,
  pageVideos,
  loadingVideos,
  onRefreshVideos,
}) => {
  const carouselSlides = useMetaPublishStore((s) => s.carouselSlides);
  const selectedSlideId = useMetaPublishStore((s) => s.selectedSlideId);
  const link = useMetaPublishStore((s) => s.link);
  const setLink = useMetaPublishStore((s) => s.setLink);
  const setSelectedSlideId = useMetaPublishStore((s) => s.setSelectedSlideId);
  const addCarouselSlide = useMetaPublishStore((s) => s.addCarouselSlide);
  const updateCarouselSlide = useMetaPublishStore((s) => s.updateCarouselSlide);
  const removeCarouselSlide = useMetaPublishStore((s) => s.removeCarouselSlide);
  const moveCarouselSlide = useMetaPublishStore((s) => s.moveCarouselSlide);

  const selectedSlide = useMemo(
    () => carouselSlides.find((s) => s.id === selectedSlideId) ?? null,
    [carouselSlides, selectedSlideId]
  );

  const pageVideoOptions = useMemo(
    () =>
      pageVideos.map((v) => ({
        label: v.title?.trim() || `Video ${v.id}`,
        value: v.id,
      })),
    [pageVideos]
  );

  const addVideoCard = () => {
    if (carouselSlides.length >= MAX_CAROUSEL) return;
    addCarouselSlide({ kind: "video", description: DEFAULT_PE_CARD_FOOTER });
  };

  const addPhotoCard = () => {
    if (carouselSlides.length >= MAX_CAROUSEL) return;
    addCarouselSlide({ kind: "photo", description: DEFAULT_PE_CARD_FOOTER });
  };

  const pickSlideMedia = async (slide: CarouselSlideDraft) => {
    const path = await api.pickMediaFile();
    if (!path) return;
    updateCarouselSlide(slide.id, {
      filePath: path,
      pageVideoId: undefined,
      previewUrl: pathToPreview(path),
      name: slide.name || path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, ""),
    });
  };

  return (
    <div className="pe-carousel-builder flex flex-col gap-14px">
      <div className="flex flex-col gap-6px">
        <div className="text-13px text-t-primary">Default card link</div>
        <div className="text-12px text-t-tertiary">
          Each carousel card opens this URL unless a card overrides it below.
        </div>
        <Input
          value={link}
          onChange={setLink}
          placeholder={pageId ? `https://www.facebook.com/${pageId}` : "https://…"}
        />
      </div>

      <div className="flex items-center justify-between gap-8px">
        <div>
          <div className="text-13px text-t-primary">Carousel cards</div>
          <div className="text-12px text-t-tertiary">
            Mix videos and photos like a Facebook PE post · {MIN_CAROUSEL}–{MAX_CAROUSEL} cards
          </div>
        </div>
        <div className="flex gap-6px shrink-0">
          <Button
            size="small"
            icon={<VideoOne theme="outline" size="14" />}
            disabled={carouselSlides.length >= MAX_CAROUSEL}
            onClick={addVideoCard}
          >
            Video
          </Button>
          <Button
            size="small"
            icon={<Pic theme="outline" size="14" />}
            disabled={carouselSlides.length >= MAX_CAROUSEL}
            onClick={addPhotoCard}
          >
            Photo
          </Button>
        </div>
      </div>

      <div className="pe-carousel-strip flex gap-10px overflow-x-auto pb-4px">
        {carouselSlides.length === 0 ? (
          <div className="pe-carousel-empty text-12px text-t-tertiary py-20px px-12px rd-10px border border-dashed border-b-base w-full text-center">
            Add at least two cards — e.g. one video and one photo with footer text like “Like Page”.
          </div>
        ) : (
          carouselSlides.map((slide, index) => {
            const active = slide.id === selectedSlideId;
            return (
              <button
                key={slide.id}
                type="button"
                className={`pe-carousel-card shrink-0 text-left border-none cursor-pointer p-0 bg-transparent ${active ? "pe-carousel-card--active" : ""}`}
                onClick={() => setSelectedSlideId(slide.id)}
              >
                <div className="pe-carousel-card__media">
                  {slide.previewUrl ? (
                    <img src={slide.previewUrl} alt="" className="pe-carousel-card__img" />
                  ) : slide.kind === "video" ? (
                    <VideoOne theme="outline" size="28" fill="currentColor" className="text-t-tertiary" />
                  ) : (
                    <Pic theme="outline" size="28" fill="currentColor" className="text-t-tertiary" />
                  )}
                </div>
                <div className="pe-carousel-card__footer truncate">
                  {slide.description?.trim() || DEFAULT_PE_CARD_FOOTER}
                </div>
                <div className="pe-carousel-card__index text-10px text-t-tertiary mt-4px">
                  {index + 1}. {slide.kind === "video" ? "Video" : "Photo"}
                </div>
              </button>
            );
          })
        )}
      </div>

      {selectedSlide ? (
        <div className="pe-carousel-editor flex flex-col gap-10px p-12px rd-10px bg-2 border border-b-base">
          <div className="flex items-center justify-between gap-8px">
            <div className="text-13px font-500 text-t-primary">
              Edit card · {slideLabel(selectedSlide)}
            </div>
            <div className="flex gap-4px">
              <Button
                size="mini"
                type="text"
                icon={<Left theme="outline" size="14" />}
                onClick={() => moveCarouselSlide(selectedSlide.id, -1)}
              />
              <Button
                size="mini"
                type="text"
                icon={<Right theme="outline" size="14" />}
                onClick={() => moveCarouselSlide(selectedSlide.id, 1)}
              />
              <Button
                size="mini"
                type="text"
                status="danger"
                icon={<Delete theme="outline" size="14" />}
                onClick={() => removeCarouselSlide(selectedSlide.id)}
              />
            </div>
          </div>

          {selectedSlide.kind === "video" ? (
            <div className="flex flex-col gap-6px">
              <div className="text-12px text-t-secondary">Video source</div>
              <Select
                allowClear
                placeholder="Choose from Page…"
                value={selectedSlide.pageVideoId}
                options={pageVideoOptions}
                loading={loadingVideos}
                onChange={(v) => {
                  const video = pageVideos.find((item) => item.id === v);
                  updateCarouselSlide(selectedSlide.id, {
                    pageVideoId: v ? String(v) : undefined,
                    filePath: v ? undefined : selectedSlide.filePath,
                    previewUrl: video?.thumbnailUrl ?? selectedSlide.previewUrl,
                    name: video?.title ?? selectedSlide.name,
                  });
                }}
              />
              <div className="flex gap-8px">
                <Input
                  className="flex-1"
                  value={selectedSlide.filePath ?? ""}
                  placeholder="Or local video path"
                  onChange={(v) =>
                    updateCarouselSlide(selectedSlide.id, {
                      filePath: v,
                      pageVideoId: undefined,
                      previewUrl: v ? pathToPreview(v) : undefined,
                    })
                  }
                />
                <Button onClick={() => void pickSlideMedia(selectedSlide)}>Browse</Button>
              </div>
              <Button size="small" type="text" onClick={onRefreshVideos}>
                Refresh Page videos
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-6px">
              <div className="text-12px text-t-secondary">Photo file</div>
              <div className="flex gap-8px">
                <Input
                  className="flex-1"
                  value={selectedSlide.filePath ?? ""}
                  onChange={(v) =>
                    updateCarouselSlide(selectedSlide.id, {
                      filePath: v,
                      previewUrl: v ? pathToPreview(v) : undefined,
                    })
                  }
                />
                <Button onClick={() => void pickSlideMedia(selectedSlide)}>Browse</Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-6px">
            <div className="text-12px text-t-secondary">Card title</div>
            <Input
              value={selectedSlide.name ?? ""}
              onChange={(v) => updateCarouselSlide(selectedSlide.id, { name: v })}
              placeholder="Headline on the card"
            />
          </div>

          <div className="flex flex-col gap-6px">
            <div className="text-12px text-t-secondary">Card footer</div>
            <Input
              value={selectedSlide.description ?? ""}
              onChange={(v) => updateCarouselSlide(selectedSlide.id, { description: v })}
              placeholder={DEFAULT_PE_CARD_FOOTER}
            />
          </div>

          <div className="flex flex-col gap-6px">
            <div className="text-12px text-t-secondary">Card link (optional)</div>
            <Input
              value={selectedSlide.link ?? ""}
              onChange={(v) => updateCarouselSlide(selectedSlide.id, { link: v })}
              placeholder="Uses default link when empty"
            />
          </div>
        </div>
      ) : null}

      <div className="text-12px text-t-tertiary">
        {carouselSlides.length} / {MAX_CAROUSEL} cards · minimum {MIN_CAROUSEL} to publish
      </div>
    </div>
  );
};

export default PeCarouselBuilder;

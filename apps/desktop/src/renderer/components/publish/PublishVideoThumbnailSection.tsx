import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Message, Spin } from "@arco-design/web-react";
import { Camera } from "@icon-park/react";
import CarouselThumbnailModal from "@renderer/components/publish/CarouselThumbnailModal";
import {
  previewUrlForLocalPath,
  pathToPreview,
} from "@renderer/components/publish/carouselPreview";
import {
  customThumbnailFromPath,
  generatedVideoThumbnailAssets,
  PRESET_CAROUSEL_THUMBNAILS,
  thumbnailMatchesSlide,
  type CarouselThumbnailAsset,
} from "@renderer/components/publish/carouselThumbnailAssets";
import type { CarouselSlideDraft } from "@renderer/pages/publish/metaPublishStore";
import { api } from "@renderer/api";

type PublishVideoThumbnailSectionProps = {
  slide: CarouselSlideDraft;
  videoThumbnailPath: string;
  onThumbnailPathChange: (path: string | undefined) => void;
};

const PublishVideoThumbnailSection: React.FC<PublishVideoThumbnailSectionProps> = ({
  slide,
  videoThumbnailPath,
  onThumbnailPathChange,
}) => {
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [customThumbnails, setCustomThumbnails] = useState<CarouselThumbnailAsset[]>([]);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<CarouselThumbnailAsset[]>([]);
  const [generating, setGenerating] = useState(false);
  const generatedForPathRef = useRef<string | null>(null);

  const libraryThumbnails = useMemo(
    () => [...PRESET_CAROUSEL_THUMBNAILS, ...customThumbnails],
    [customThumbnails]
  );

  const thumbPreview = videoThumbnailPath.trim()
    ? pathToPreview(videoThumbnailPath.trim())
    : previewUrlForLocalPath(slide.filePath ?? "", "photo");

  useEffect(() => {
    const filePath = slide.filePath?.trim();
    if (!filePath || videoThumbnailPath.trim()) return;
    if (generatedForPathRef.current === filePath) return;

    generatedForPathRef.current = filePath;
    setGenerating(true);
    void api
      .generateVideoThumbnails(filePath)
      .then((paths) => {
        const assets = generatedVideoThumbnailAssets(paths);
        setGeneratedThumbnails(assets);
        setCustomThumbnails((prev) => {
          const next = [...prev];
          for (const asset of assets) {
            if (!next.some((t) => t.id === asset.id)) next.push(asset);
          }
          return next;
        });
        const first = paths[0];
        if (first) onThumbnailPathChange(first);
      })
      .catch((err) => {
        Message.warning(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setGenerating(false));
  }, [slide.filePath, videoThumbnailPath, onThumbnailPathChange]);

  const applyThumbnail = useCallback(
    async (thumb: CarouselThumbnailAsset) => {
      let filePath = thumb.id.startsWith("custom:") ? thumb.id.slice("custom:".length) : null;
      if (!filePath) {
        filePath = await api.resolveThumbnailPath(thumb.fileName);
      }
      if (!filePath) {
        Message.error(`Could not resolve thumbnail: ${thumb.fileName}`);
        return;
      }
      onThumbnailPathChange(filePath);
      setThumbnailModalOpen(false);
    },
    [onThumbnailPathChange]
  );

  const handleUpload = async () => {
    const path = await api.pickMediaFile();
    if (!path) return;
    const custom = customThumbnailFromPath(path);
    setCustomThumbnails((prev) => (prev.some((t) => t.id === custom.id) ? prev : [...prev, custom]));
    await applyThumbnail(custom);
  };

  if (!slide.filePath?.trim()) return null;

  return (
    <section className="post-builder__section">
      <div className="post-builder__label">Thumbnail</div>
      <button
        type="button"
        className="publish-compose-source__pick has-media publish-compose-source__pick--thumb"
        onClick={() => setThumbnailModalOpen(true)}
      >
        {generating ? (
          <span className="publish-compose-thumb__generating">
            <Spin size={22} />
          </span>
        ) : thumbPreview ? (
          <img src={thumbPreview} alt="" className="publish-compose-source__thumb" />
        ) : (
          <Camera theme="outline" size="28" fill="currentColor" />
        )}
        <span className="publish-compose-source__pick-label">Choose thumbnail</span>
      </button>

      <CarouselThumbnailModal
        visible={thumbnailModalOpen}
        slide={slide}
        libraryThumbnails={libraryThumbnails}
        generatedThumbnails={generatedThumbnails}
        generating={generating}
        isApplied={(thumb) => thumbnailMatchesSlide(thumb, slide.filePath, videoThumbnailPath)}
        onClose={() => setThumbnailModalOpen(false)}
        onPick={(thumb) => void applyThumbnail(thumb)}
        onUpload={() => void handleUpload()}
      />
    </section>
  );
};

export default PublishVideoThumbnailSection;

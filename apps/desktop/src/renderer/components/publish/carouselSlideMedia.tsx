import React, { useEffect, useState } from "react";
import { Pic, PlayOne, UploadOne, VideoOne } from "@icon-park/react";
import PublishReelsVideoPlayer from "@renderer/components/publish/PublishReelsVideoPlayer";
import {
  slidePreviewUrl,
  slideVideoSrcUrl,
} from "@renderer/components/publish/carouselPreview";
import type { CarouselSlideDraft } from "@renderer/pages/publish/metaPublishStore";
import type { MetaPageVideoSummary } from "@renderer/api";

type SlideCardMediaProps = {
  slide: CarouselSlideDraft;
  pageVideos: MetaPageVideoSummary[];
  className: string;
  fallback: React.ReactNode;
};

export const CarouselSlidePhotoMedia: React.FC<SlideCardMediaProps> = ({
  slide,
  pageVideos,
  className,
  fallback,
}) => {
  const [failed, setFailed] = useState(false);
  const imageSrc = slidePreviewUrl(slide, pageVideos);

  useEffect(() => {
    setFailed(false);
  }, [imageSrc, slide.id]);

  if (imageSrc && !failed) {
    return <img src={imageSrc} alt="" className={className} onError={() => setFailed(true)} />;
  }

  return <>{fallback}</>;
};

type SlideVideoPreviewProps = {
  slide: CarouselSlideDraft;
  pageVideos: MetaPageVideoSummary[];
  className: string;
  fallback: React.ReactNode;
  generatingThumb: boolean;
};

export const CarouselSlideVideoPreview: React.FC<SlideVideoPreviewProps> = ({
  slide,
  pageVideos,
  className,
  fallback,
  generatingThumb,
}) => {
  const videoSrc = slideVideoSrcUrl(slide);
  const poster = slidePreviewUrl(slide, pageVideos);

  if (videoSrc) {
    return (
      <PublishReelsVideoPlayer
        src={videoSrc}
        poster={poster}
        variant="feed"
        className={className}
      />
    );
  }

  if (poster) {
    return (
      <>
        <img src={poster} alt="" className={className} />
        {!generatingThumb ? (
          <span className="fb-pe-card__play fb-pe-card__play--static" aria-hidden title="Preview play requires a local video file">
            <PlayOne theme="filled" size="32" fill="currentColor" />
          </span>
        ) : null}
      </>
    );
  }

  return <>{fallback}</>;
};

export function carouselSlotFilled(
  slide: CarouselSlideDraft,
  pageVideos: MetaPageVideoSummary[]
): boolean {
  return Boolean(slidePreviewUrl(slide, pageVideos) || slideVideoSrcUrl(slide));
}

export function renderCarouselSlotFallback(
  slide: CarouselSlideDraft,
  filled: boolean,
  size = 32
): React.ReactNode {
  if (!filled) {
    return (
      <>
        <UploadOne theme="outline" size={size} fill="currentColor" className="fb-pe-card__placeholder-icon" />
        <span className="fb-pe-card__upload-label">{slide.kind === "video" ? "Add video" : "Add photo"}</span>
      </>
    );
  }
  return slide.kind === "video" ? (
    <VideoOne theme="outline" size={size} fill="currentColor" className="fb-pe-card__placeholder-icon" />
  ) : (
    <Pic theme="outline" size={size} fill="currentColor" className="fb-pe-card__placeholder-icon" />
  );
}

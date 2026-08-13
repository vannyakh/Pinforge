import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Message, Spin, Tooltip } from "@arco-design/web-react";
import {
  Camera,
  Close,
  Earth,
  Message as MessageIcon,
  More,
  Pic,
  Plus,
  Share,
  ThumbsUp,
  VideoOne,
} from "@icon-park/react";
import CarouselThumbnailModal from "@renderer/components/publish/CarouselThumbnailModal";
import PublishReelsVideoPlayer from "@renderer/components/publish/PublishReelsVideoPlayer";
import { pathToPreview, slidePreviewUrl, slideVideoSrcUrl } from "@renderer/components/publish/carouselPreview";
import {
  customThumbnailFromPath,
  generatedVideoThumbnailAssets,
  PRESET_CAROUSEL_THUMBNAILS,
  thumbnailMatchesSlide,
  type CarouselThumbnailAsset,
} from "@renderer/components/publish/carouselThumbnailAssets";
import { buildPublishMessage } from "@renderer/components/publish/publishComposeMessage";
import { api, type MetaPostType } from "@renderer/api";
import {
  MAX_PHOTO_ALBUM,
  useMetaPublishStore,
  type CarouselSlideDraft,
} from "@renderer/pages/publish/metaPublishStore";

const FEED_CAPTION_MAX = 180;
const MEDIA_SOURCE_HINT = "URL download or pick from a folder";
const ALBUM_PHOTO_HINT = "JPEG, PNG, GIF, BMP, TIFF · max 10MB each";

type PublishPostPreviewProps = {
  postType: MetaPostType;
  pageId?: string;
  pageName?: string;
  inlinePreview?: boolean;
  slide: CarouselSlideDraft | null;
  videoThumbnailPath: string;
  onOpenSource: () => void;
  onThumbnailPathChange: (path: string | undefined) => void;
};

function truncateFeedCaption(text: string): { body: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= FEED_CAPTION_MAX) {
    return { body: trimmed, truncated: false };
  }
  return {
    body: trimmed.slice(0, FEED_CAPTION_MAX).trimEnd(),
    truncated: true,
  };
}

const PublishPostPreview: React.FC<PublishPostPreviewProps> = ({
  postType,
  pageId,
  pageName,
  inlinePreview = false,
  slide,
  videoThumbnailPath,
  onOpenSource,
  onThumbnailPathChange,
}) => {
  const message = useMetaPublishStore((s) => s.message);
  const hashtags = useMetaPublishStore((s) => s.hashtags);
  const photoPostMode = useMetaPublishStore((s) => s.photoPostMode);
  const photoAlbumPaths = useMetaPublishStore((s) => s.photoAlbumPaths);
  const addPhotoAlbumPaths = useMetaPublishStore((s) => s.addPhotoAlbumPaths);
  const removePhotoAlbumPath = useMetaPublishStore((s) => s.removePhotoAlbumPath);
  const photoCarouselSlides = useMetaPublishStore((s) => s.photoCarouselSlides);

  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [customThumbnails, setCustomThumbnails] = useState<CarouselThumbnailAsset[]>([]);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<CarouselThumbnailAsset[]>([]);
  const [generatingThumb, setGeneratingThumb] = useState(false);
  const generatedForPathRef = useRef<string | null>(null);

  const isVideoPost = postType === "video";
  const isPhotoPost = postType === "photo";
  const isTextPost = postType === "text";
  const hasMedia = Boolean(slide?.filePath?.trim());
  const previewMessage = buildPublishMessage(message, hashtags);
  const feedCaption = truncateFeedCaption(previewMessage);

  const pageLabel = pageName?.trim() || (pageId ? `Page ${pageId}` : "Your Page");
  const pageInitial = pageLabel.charAt(0).toUpperCase();

  const libraryThumbnails = useMemo(
    () => [...PRESET_CAROUSEL_THUMBNAILS, ...customThumbnails],
    [customThumbnails]
  );

  const mediaPreviewUrl = slide ? slidePreviewUrl(slide, []) : undefined;
  const videoSrcUrl = slide ? slideVideoSrcUrl(slide) : undefined;
  const videoPosterUrl =
    videoThumbnailPath.trim() ? mediaPreviewUrl : mediaPreviewUrl !== videoSrcUrl ? mediaPreviewUrl : undefined;

  useEffect(() => {
    const filePath = slide?.filePath?.trim();
    if (!isVideoPost || !filePath || videoThumbnailPath.trim()) return;
    if (generatedForPathRef.current === filePath) return;

    generatedForPathRef.current = filePath;
    setGeneratingThumb(true);
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
      .finally(() => setGeneratingThumb(false));
  }, [isVideoPost, slide?.filePath, videoThumbnailPath, onThumbnailPathChange]);

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

  const handleUploadThumbnail = async () => {
    const path = await api.pickMediaFile();
    if (!path) return;
    const custom = customThumbnailFromPath(path);
    setCustomThumbnails((prev) => (prev.some((t) => t.id === custom.id) ? prev : [...prev, custom]));
    await applyThumbnail(custom);
  };

  const pickAlbumPhotos = useCallback(async () => {
    if (photoAlbumPaths.length >= MAX_PHOTO_ALBUM) {
      Message.warning(`Album posts support up to ${MAX_PHOTO_ALBUM} images.`);
      return;
    }
    const paths = await api.pickImageFiles();
    if (!paths.length) return;
    const before = photoAlbumPaths.length;
    addPhotoAlbumPaths(paths);
    const after = useMetaPublishStore.getState().photoAlbumPaths.length;
    const added = after - before;
    if (added < paths.length) {
      Message.warning("Some files were skipped (Meta accepts JPEG/PNG/GIF/BMP/TIFF only, max 10).");
    }
  }, [addPhotoAlbumPaths, photoAlbumPaths.length]);

  const renderMediaFallback = () => {
    if (isVideoPost) {
      return (
        <VideoOne
          theme="outline"
          size="36"
          fill="currentColor"
          className="fb-pe-post-media__placeholder-icon"
        />
      );
    }
    if (isPhotoPost) {
      return (
        <Pic theme="outline" size="36" fill="currentColor" className="fb-pe-post-media__placeholder-icon" />
      );
    }
    return null;
  };

  const renderVideoFeedPreview = () => (
    <div className={inlinePreview ? "fb-feed-post-preview fb-feed-post-preview--inline" : "fb-feed-post-preview"}>
      <div className="fb-feed-post-preview__header">
        <div className="fb-feed-post-preview__avatar" aria-hidden>
          {pageInitial}
        </div>
        <div className="fb-feed-post-preview__meta">
          <div className="fb-feed-post-preview__name">{pageLabel}</div>
          <div className="fb-feed-post-preview__time">
            Just now
            <Earth theme="outline" size="12" fill="currentColor" className="fb-feed-post-preview__globe" />
          </div>
        </div>
        <span className="fb-feed-post-preview__menu" aria-hidden>
          <More theme="outline" size="18" fill="currentColor" />
        </span>
      </div>

      {previewMessage.trim() ? (
        <div className="fb-feed-post-preview__caption">
          {feedCaption.body}
          {feedCaption.truncated ? (
            <>
              {" "}
              <span className="fb-feed-post-preview__see-more">… See more</span>
            </>
          ) : null}
        </div>
      ) : (
        <div className="fb-feed-post-preview__caption fb-feed-post-preview__caption--placeholder">
          Your caption and hashtags will appear here…
        </div>
      )}

      <div className="fb-feed-post-preview__media">
        {hasMedia && videoSrcUrl ? (
          <>
            <PublishReelsVideoPlayer src={videoSrcUrl} poster={videoPosterUrl} variant="feed" />
            {generatingThumb ? (
              <span className="fb-feed-post-preview__generating" aria-hidden>
                <Spin size={22} />
              </span>
            ) : null}
            <div className="fb-feed-post-preview__media-tools">
              <button type="button" className="fb-feed-post-preview__tool" onClick={onOpenSource}>
                Change source
              </button>
              <button
                type="button"
                className="fb-feed-post-preview__tool"
                onClick={() => setThumbnailModalOpen(true)}
              >
                <Camera theme="outline" size="14" fill="currentColor" />
                Thumbnail
              </button>
            </div>
          </>
        ) : (
          <Tooltip content={MEDIA_SOURCE_HINT}>
            <span className="fb-feed-post-preview__media-tooltip">
              <button
                type="button"
                className="fb-feed-post-preview__media-empty"
                onClick={onOpenSource}
                aria-label="Select video"
              >
                {renderMediaFallback()}
                <span className="fb-feed-post-preview__empty-label">Select video</span>
              </button>
            </span>
          </Tooltip>
        )}
      </div>

      <div className="fb-feed-post-preview__stats" aria-hidden>
        <div className="fb-feed-post-preview__stat">
          <ThumbsUp theme="outline" size="16" fill="currentColor" />
          <span>Like</span>
        </div>
        <div className="fb-feed-post-preview__stat">
          <MessageIcon theme="outline" size="16" fill="currentColor" />
          <span>Comment</span>
        </div>
        <div className="fb-feed-post-preview__stat">
          <Share theme="outline" size="16" fill="currentColor" />
          <span>Share</span>
        </div>
        <div className="fb-feed-post-preview__reactions">
          <span className="fb-feed-post-preview__reaction fb-feed-post-preview__reaction--like" />
          <span className="fb-feed-post-preview__reaction fb-feed-post-preview__reaction--love" />
        </div>
      </div>
    </div>
  );

  const renderPhotoFeedPreview = () => (
    <div className={inlinePreview ? "fb-feed-post-preview fb-feed-post-preview--inline" : "fb-feed-post-preview"}>
      <div className="fb-feed-post-preview__header">
        <div className="fb-feed-post-preview__avatar" aria-hidden>
          {pageInitial}
        </div>
        <div className="fb-feed-post-preview__meta">
          <div className="fb-feed-post-preview__name">{pageLabel}</div>
          <div className="fb-feed-post-preview__time">
            Just now
            <Earth theme="outline" size="12" fill="currentColor" className="fb-feed-post-preview__globe" />
          </div>
        </div>
        <span className="fb-feed-post-preview__menu" aria-hidden>
          <More theme="outline" size="18" fill="currentColor" />
        </span>
      </div>

      {previewMessage.trim() ? (
        <div className="fb-feed-post-preview__caption">
          {feedCaption.body}
          {feedCaption.truncated ? (
            <>
              {" "}
              <span className="fb-feed-post-preview__see-more">… See more</span>
            </>
          ) : null}
        </div>
      ) : (
        <div className="fb-feed-post-preview__caption fb-feed-post-preview__caption--placeholder">
          Your caption and hashtags will appear here…
        </div>
      )}

      <div className="fb-feed-post-preview__media">
        {photoPostMode === "album" ? (
          photoAlbumPaths.length > 0 ? (
            <div
              className={`fb-feed-post-preview__album${photoAlbumPaths.length > 2 ? " fb-feed-post-preview__album--grid" : ""}`}
            >
              {photoAlbumPaths.map((path) => (
                <div key={path} className="fb-feed-post-preview__album-item">
                  <img src={pathToPreview(path)} alt="" className="fb-feed-post-preview__album-img" />
                  <button
                    type="button"
                    className="fb-feed-post-preview__album-remove"
                    aria-label="Remove photo"
                    onClick={() => removePhotoAlbumPath(path)}
                  >
                    <Close theme="outline" size="12" fill="currentColor" />
                  </button>
                </div>
              ))}
              {photoAlbumPaths.length < MAX_PHOTO_ALBUM ? (
                <button
                  type="button"
                  className="fb-feed-post-preview__album-add"
                  aria-label="Add album photos"
                  onClick={() => void pickAlbumPhotos()}
                >
                  <Plus theme="outline" size="22" fill="currentColor" />
                  <span>Add</span>
                </button>
              ) : null}
            </div>
          ) : (
            <Tooltip content={ALBUM_PHOTO_HINT}>
              <span className="fb-feed-post-preview__media-tooltip">
                <button
                  type="button"
                  className="fb-feed-post-preview__media-empty"
                  onClick={() => void pickAlbumPhotos()}
                >
                  {renderMediaFallback()}
                  <span className="fb-feed-post-preview__empty-label">Add album photos</span>
                </button>
              </span>
            </Tooltip>
          )
        ) : photoPostMode === "carousel" ? (
          <div className="fb-feed-post-preview__carousel">
            {photoCarouselSlides.map((card) => (
              <div key={card.id} className="fb-feed-post-preview__carousel-card">
                {card.filePath?.trim() ? (
                  <img
                    src={card.previewUrl ?? pathToPreview(card.filePath.trim())}
                    alt=""
                    className="fb-feed-post-preview__carousel-img"
                  />
                ) : (
                  <span className="fb-feed-post-preview__carousel-empty">
                    <Pic theme="outline" size="24" fill="currentColor" />
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : hasMedia && mediaPreviewUrl ? (
          <img src={mediaPreviewUrl} alt="" className="fb-feed-post-preview__photo" />
        ) : (
          <Tooltip content={MEDIA_SOURCE_HINT}>
            <span className="fb-feed-post-preview__media-tooltip">
              <button type="button" className="fb-feed-post-preview__media-empty" onClick={onOpenSource}>
                {renderMediaFallback()}
                <span className="fb-feed-post-preview__empty-label">Select photo</span>
              </button>
            </span>
          </Tooltip>
        )}
      </div>

      <div className="fb-feed-post-preview__stats" aria-hidden>
        <div className="fb-feed-post-preview__stat">
          <ThumbsUp theme="outline" size="16" fill="currentColor" />
          <span>Like</span>
        </div>
        <div className="fb-feed-post-preview__stat">
          <MessageIcon theme="outline" size="16" fill="currentColor" />
          <span>Comment</span>
        </div>
        <div className="fb-feed-post-preview__stat">
          <Share theme="outline" size="16" fill="currentColor" />
          <span>Share</span>
        </div>
        <div className="fb-feed-post-preview__reactions">
          <span className="fb-feed-post-preview__reaction fb-feed-post-preview__reaction--like" />
          <span className="fb-feed-post-preview__reaction fb-feed-post-preview__reaction--love" />
        </div>
      </div>
    </div>
  );

  const renderFeedPreview = () => (
    <div className={inlinePreview ? "fb-pe-preview fb-pe-preview--inline" : "fb-pe-preview"}>
      <div className="fb-pe-preview__header">
        <div className="fb-pe-preview__avatar" aria-hidden>
          {pageInitial}
        </div>
        <div className="fb-pe-preview__meta-block">
          <div className="fb-pe-preview__page">{pageLabel}</div>
          <div className="fb-pe-preview__time">Just now · Public</div>
        </div>
      </div>

      {previewMessage.trim() ? (
        <div className="fb-pe-preview__caption">{previewMessage}</div>
      ) : (
        <div className="fb-pe-preview__caption fb-pe-preview__caption--placeholder">
          Your caption will appear here…
        </div>
      )}

      {!isTextPost ? (
        <button
          type="button"
          className={`fb-pe-post-media ${hasMedia ? "fb-pe-post-media--filled" : "fb-pe-post-media--empty"}`}
          onClick={onOpenSource}
          onDoubleClick={onOpenSource}
          aria-label={hasMedia ? "Change media source" : isPhotoPost ? "Select photo" : "Select video"}
        >
          {hasMedia ? (
            <>
              {mediaPreviewUrl ? (
                <img src={mediaPreviewUrl} alt="" className="fb-pe-post-media__img" />
              ) : (
                renderMediaFallback()
              )}
              <span className="fb-pe-post-media__change">Change source</span>
            </>
          ) : (
            <Tooltip content={MEDIA_SOURCE_HINT}>
              <span className="fb-pe-post-media__empty-inner">
                {renderMediaFallback()}
                <span className="fb-pe-post-media__empty-label">Select photo</span>
              </span>
            </Tooltip>
          )}
        </button>
      ) : null}
    </div>
  );

  return (
    <section className="post-builder__section">
      <div className="post-builder__label">Preview</div>
      {isVideoPost ? renderVideoFeedPreview() : isPhotoPost ? renderPhotoFeedPreview() : renderFeedPreview()}

      {isVideoPost && slide ? (
        <CarouselThumbnailModal
          visible={thumbnailModalOpen}
          slide={slide}
          libraryThumbnails={libraryThumbnails}
          generatedThumbnails={generatedThumbnails}
          generating={generatingThumb}
          isApplied={(thumb) => thumbnailMatchesSlide(thumb, slide.filePath, videoThumbnailPath)}
          onClose={() => setThumbnailModalOpen(false)}
          onPick={(thumb) => void applyThumbnail(thumb)}
          onUpload={() => void handleUploadThumbnail()}
        />
      ) : null}
    </section>
  );
};

export default PublishPostPreview;

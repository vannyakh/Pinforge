import type { MetaPageVideoSummary } from "@renderer/api";
import type { CarouselSlideDraft } from "@renderer/pages/publish/metaPublishStore";
import defaultPhotoCardUrl from "@renderer/assets/thumbnails/thumbs-01.png?url";

const DEFAULT_PHOTO_CARD_PREVIEW =
  typeof defaultPhotoCardUrl === "string" ? defaultPhotoCardUrl : "";

const IMAGE_PATH_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const VIDEO_PATH_RE = /\.(mp4|mov|mkv|webm|m4v)$/i;

export function isImageFilePath(filePath: string): boolean {
  return IMAGE_PATH_RE.test(filePath.trim());
}

function isVideoMediaUrl(url: string): boolean {
  if (VIDEO_PATH_RE.test(url)) return true;
  try {
    const decoded = decodeURIComponent(url.replace(/^pinmedia:\/\//, ""));
    return VIDEO_PATH_RE.test(decoded);
  } catch {
    return false;
  }
}

export function pathToPreview(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `pinmedia://${encodeURI(normalized)}`;
  }
  const abs = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `pinmedia://${encodeURI(abs)}`;
}

/** Image URL for carousel card — custom thumbnail, Page video thumb, or photo file. */
export function slidePreviewUrl(
  slide: CarouselSlideDraft,
  pageVideos: MetaPageVideoSummary[]
): string | undefined {
  if (slide.videoThumbnailPath?.trim()) {
    return pathToPreview(slide.videoThumbnailPath.trim());
  }

  if (slide.pageVideoId) {
    return pageVideos.find((v) => v.id === slide.pageVideoId)?.thumbnailUrl ?? undefined;
  }

  if (slide.previewUrl && !isVideoMediaUrl(slide.previewUrl)) {
    return slide.previewUrl;
  }

  const filePath = slide.filePath?.trim();
  if (filePath && (slide.kind === "photo" || IMAGE_PATH_RE.test(filePath))) {
    return pathToPreview(filePath);
  }

  if (slide.kind === "photo" && DEFAULT_PHOTO_CARD_PREVIEW) {
    return DEFAULT_PHOTO_CARD_PREVIEW;
  }

  return undefined;
}

/** Video file URL for `<video preload="metadata">` when no raster thumbnail exists. */
export function slideVideoSrcUrl(slide: CarouselSlideDraft): string | undefined {
  if (slide.kind !== "video") return undefined;
  const filePath = slide.filePath?.trim();
  if (filePath) return pathToPreview(filePath);
  if (slide.previewUrl && isVideoMediaUrl(slide.previewUrl)) return slide.previewUrl;
  return undefined;
}

export function slotHasSource(slide: CarouselSlideDraft): boolean {
  if (slide.kind === "video") return Boolean(slide.pageVideoId?.trim() || slide.filePath?.trim());
  return Boolean(slide.filePath?.trim());
}

export function previewUrlForLocalPath(filePath: string, kind: CarouselSlideDraft["kind"]): string | undefined {
  if (kind === "photo" || IMAGE_PATH_RE.test(filePath)) {
    return pathToPreview(filePath);
  }
  if (kind === "video" || VIDEO_PATH_RE.test(filePath)) {
    return pathToPreview(filePath);
  }
  return undefined;
}

import type { MetaPageVideoSummary } from "@renderer/api";
import type { CarouselSlideDraft } from "@renderer/pages/publish/metaPublishStore";

const IMAGE_PATH_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const VIDEO_PATH_RE = /\.(mp4|mov|mkv|webm|m4v)$/i;

export function pathToPreview(filePath: string): string {
  return `pinmedia://${encodeURIComponent(filePath.replace(/\\/g, "/"))}`;
}

/** Image URL safe for <img> tags — local videos have no raster preview. */
export function slidePreviewUrl(
  slide: CarouselSlideDraft,
  pageVideos: MetaPageVideoSummary[]
): string | undefined {
  if (slide.pageVideoId) {
    return pageVideos.find((v) => v.id === slide.pageVideoId)?.thumbnailUrl ?? undefined;
  }

  const filePath = slide.filePath?.trim();
  if (filePath) {
    if (slide.kind === "photo" || IMAGE_PATH_RE.test(filePath)) {
      return pathToPreview(filePath);
    }
    return undefined;
  }

  if (slide.previewUrl && !VIDEO_PATH_RE.test(slide.previewUrl)) {
    return slide.previewUrl;
  }

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
  return undefined;
}

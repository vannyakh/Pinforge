/** Local file types accepted for PE carousel cards (aligned with Meta publish validation). */

export const CAROUSEL_VIDEO_EXT = /\.(mp4|mov|mkv|webm|m4v)$/i;

/** Meta Page photo formats + common preview formats. */
export const CAROUSEL_IMAGE_EXT = /\.(jpe?g|png|gif|bmp|tiff?|webp|avif)$/i;

export const CAROUSEL_META_IMAGE_EXT = /\.(jpe?g|png|gif|bmp|tiff?)$/i;

export function isCarouselVideoPath(filePath: string): boolean {
  return CAROUSEL_VIDEO_EXT.test(filePath.trim());
}

export function isCarouselImagePath(filePath: string): boolean {
  return CAROUSEL_IMAGE_EXT.test(filePath.trim());
}

export function isCarouselMetaImagePath(filePath: string): boolean {
  return CAROUSEL_META_IMAGE_EXT.test(filePath.trim());
}

export function validateCarouselVideoPick(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return "No file selected.";
  if (!isCarouselVideoPath(trimmed)) {
    return "Choose a video file (MP4, MOV, MKV, WebM, or M4V).";
  }
  return null;
}

export function validateCarouselImagePick(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return "No file selected.";
  if (!isCarouselImagePath(trimmed)) {
    return "Choose an image file (JPEG, PNG, GIF, BMP, or TIFF).";
  }
  return null;
}

export function validateCarouselThumbnailPick(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return "No file selected.";
  if (!isCarouselMetaImagePath(trimmed)) {
    return "Thumbnails must be JPEG, PNG, GIF, BMP, or TIFF (Meta carousel spec).";
  }
  return null;
}

export function carouselSlotLabel(kind: "video" | "photo", index: number): string {
  if (kind === "video") return index === 0 ? "Video · left card" : "Video card";
  return index === 1 ? "Photo · right card" : "Photo card";
}

export function videoCardNeedsThumbnail(
  slide: {
    kind?: string;
    filePath?: string;
    pageVideoId?: string;
    videoThumbnailPath?: string;
    previewUrl?: string;
  },
  pageVideos: Array<{ id: string; thumbnailUrl?: string }> = []
): boolean {
  if (slide.kind !== "video") return false;
  const hasSource = Boolean(slide.pageVideoId?.trim() || slide.filePath?.trim());
  if (!hasSource) return false;
  if (slide.videoThumbnailPath?.trim()) return false;
  if (slide.pageVideoId?.trim()) {
    const pageThumb = pageVideos.find((v) => v.id === slide.pageVideoId)?.thumbnailUrl?.trim();
    if (pageThumb) return false;
  }
  return Boolean(slide.filePath?.trim());
}

export type CarouselSlotPipelinePhase =
  | "select_source"
  | "create_ad"
  | "generate_thumbnails"
  | "pick_thumbnail"
  | "ready";

export function carouselSlotHasSource(slide: {
  kind?: string;
  filePath?: string;
  pageVideoId?: string;
}): boolean {
  if (slide.kind === "video") return Boolean(slide.pageVideoId?.trim() || slide.filePath?.trim());
  return Boolean(slide.filePath?.trim());
}

export function carouselSlotPipelinePhase(
  slide: {
    kind?: string;
    filePath?: string;
    pageVideoId?: string;
    videoThumbnailPath?: string;
    previewUrl?: string;
  },
  pageVideos: Array<{ id: string; thumbnailUrl?: string }>,
  generatingThumb: boolean,
  creatingAd = false
): CarouselSlotPipelinePhase {
  if (!carouselSlotHasSource(slide)) return "select_source";
  if (slide.kind === "video") {
    if (creatingAd) return "create_ad";
    if (slide.filePath?.trim() && !slide.pageVideoId?.trim()) return "create_ad";
    if (generatingThumb) return "generate_thumbnails";
    if (videoCardNeedsThumbnail(slide, pageVideos)) return "pick_thumbnail";
  }
  return "ready";
}

export function carouselSlotPipelineLabel(phase: CarouselSlotPipelinePhase): string {
  switch (phase) {
    case "select_source":
      return "Select source";
    case "create_ad":
      return "Creating Page video…";
    case "generate_thumbnails":
      return "Generating thumbnails (ffmpeg)…";
    case "pick_thumbnail":
      return "Pick thumbnail";
    case "ready":
      return "Ready";
  }
}

/** Both carousel cards have media; video has a cover and nothing is generating. */
export function peCarouselMediaSetupReady(
  slides: Array<{
    id: string;
    kind?: string;
    filePath?: string;
    pageVideoId?: string;
    videoThumbnailPath?: string;
    previewUrl?: string;
  }>,
  pageVideos: Array<{ id: string; thumbnailUrl?: string }>,
  generatingSlideIds: Record<string, boolean> = {},
  creatingAdSlideIds: Record<string, boolean> = {}
): boolean {
  const video = slides.find((s) => s.kind === "video");
  const photo = slides.find((s) => s.kind === "photo");
  if (!video || !photo) return false;
  if (generatingSlideIds[video.id]) return false;
  if (creatingAdSlideIds[video.id]) return false;
  if (!carouselSlotHasSource(video)) return false;
  if (video.filePath?.trim() && !video.pageVideoId?.trim()) return false;
  if (videoCardNeedsThumbnail(video, pageVideos)) return false;
  if (!carouselSlotHasSource(photo)) return false;
  return true;
}

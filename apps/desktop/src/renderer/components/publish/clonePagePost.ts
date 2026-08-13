import type {
  MetaClonePostMode,
  MetaPagePostCloneDetail,
  MetaPagePostSummary,
  MetaPostType,
} from "@common/publish/types";

export function inferPostTypeFromSummary(post: MetaPagePostSummary): MetaPostType {
  if (post.isCarousel) return "video_carousel";
  const media = (post.mediaType ?? post.statusType ?? "").toLowerCase();
  if (media.includes("video")) return "video";
  if (media.includes("photo") || media.includes("image") || post.pictureUrl) return "photo";
  return "text";
}

export function clonePostKindLabel(post: MetaPagePostSummary): string {
  if (post.isCarousel) {
    const count = post.attachmentCount ?? 0;
    return count > 0 ? `Carousel · ${count} cards` : "Carousel";
  }
  const media = (post.mediaType ?? post.statusType ?? "").toLowerCase();
  if (media.includes("video")) return "Video";
  if (media.includes("photo") || media.includes("image")) return "Photo";
  if (post.pictureUrl) return "Media";
  return "Text";
}

export function formatClonePostDate(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const CLONE_MODE_OPTIONS: Array<{ label: string; value: MetaClonePostMode }> = [
  { label: "All posts", value: "all" },
  { label: "Single posts", value: "single" },
  { label: "Carousel posts", value: "carousel" },
];

export function draftFromCloneDetail(
  detail: MetaPagePostCloneDetail,
  sourceLabel: string
): {
  postType: MetaPostType;
  message: string;
  link: string;
  filePath?: string;
  carouselSlides?: MetaPagePostCloneDetail["carouselSlides"];
  hidePostTypePicker: boolean;
  sourceLabel: string;
} {
  return {
    postType: detail.postType,
    message: detail.message,
    link: detail.link,
    filePath: detail.filePath,
    carouselSlides: detail.carouselSlides,
    hidePostTypePicker: true,
    sourceLabel,
  };
}

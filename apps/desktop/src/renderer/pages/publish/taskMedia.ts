import type { HistoryItem } from "@renderer/api";
import type { MetaCarouselSlide, MetaPostType } from "@common/publish/types";

const VIDEO_PATH_RE = /\.(mp4|mov|mkv|webm|m4v)$/i;
const IMAGE_PATH_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

export function isPublishableTaskStatus(status: string): boolean {
  return status === "done" || status === "partial";
}

export function resolveTaskMediaPath(
  items: HistoryItem[],
  postType: MetaPostType
): string | undefined {
  if (postType === "text") return undefined;

  const paths = items.map((h) => h.outPath).filter(Boolean) as string[];
  if (postType === "photo") {
    return paths.find((p) => IMAGE_PATH_RE.test(p));
  }
  if (postType === "video_carousel") {
    return resolveTaskVideoPaths(items)[0];
  }
  return paths.find((p) => VIDEO_PATH_RE.test(p));
}

export function resolveTaskVideoPaths(items: HistoryItem[]): string[] {
  return items
    .map((h) => h.outPath)
    .filter((p): p is string => Boolean(p && VIDEO_PATH_RE.test(p)));
}

export function resolveTaskImagePaths(items: HistoryItem[]): string[] {
  return items
    .map((h) => h.outPath)
    .filter((p): p is string => Boolean(p && IMAGE_PATH_RE.test(p)));
}

export function buildPeSlidesFromTaskItems(items: HistoryItem[]): MetaCarouselSlide[] {
  const photoPath = resolveTaskImagePaths(items)[0];
  const videoPath = resolveTaskVideoPaths(items)[0];
  return [
    {
      kind: "video",
      filePath: videoPath,
      name: videoPath?.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, ""),
      description: "Like Page",
    },
    {
      kind: "photo",
      filePath: photoPath,
      name: photoPath?.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, ""),
      description: "Like Page",
    },
  ];
}

export function defaultPostTypeForPath(filePath?: string): MetaPostType {
  if (!filePath) return "text";
  if (VIDEO_PATH_RE.test(filePath)) return "video";
  if (IMAGE_PATH_RE.test(filePath)) return "photo";
  return "photo";
}

export function taskTitleForPublish(title?: string, url?: string): string {
  const t = title?.trim();
  if (t) return t;
  if (url?.trim()) return url.trim();
  return "";
}

import { pathToPreview } from "@renderer/components/publish/carouselPreview";

const presetModules = import.meta.glob<string>("@renderer/assets/thumbnails/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

function extractGlobUrl(mod: unknown): string {
  if (typeof mod === "string") return mod;
  if (mod && typeof mod === "object" && "default" in mod) {
    const value = (mod as { default: unknown }).default;
    return typeof value === "string" ? value : "";
  }
  return "";
}

export type CarouselThumbnailAsset = {
  id: string;
  label: string;
  previewUrl: string;
  fileName: string;
};

function labelFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const PRESET_CAROUSEL_THUMBNAILS: CarouselThumbnailAsset[] = Object.entries(presetModules)
  .map(([path, mod]) => {
    const fileName = path.split("/").pop() ?? path;
    const previewUrl = extractGlobUrl(mod);
    return {
      id: fileName,
      label: labelFromFileName(fileName),
      previewUrl,
      fileName,
    };
  })
  .filter((thumb) => thumb.previewUrl.length > 0)
  .sort((a, b) => a.fileName.localeCompare(b.fileName));

/** Default photo card image (right slot) until the user picks another. */
export const DEFAULT_PHOTO_CARD_FILE = "thumbs-01.png";

export const DEFAULT_PHOTO_CARD_THUMBNAIL: CarouselThumbnailAsset | undefined =
  PRESET_CAROUSEL_THUMBNAILS.find((t) => t.fileName === DEFAULT_PHOTO_CARD_FILE) ??
  PRESET_CAROUSEL_THUMBNAILS[0];

export function customThumbnailFromPath(filePath: string): CarouselThumbnailAsset {
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  return {
    id: `custom:${filePath}`,
    label: labelFromFileName(fileName),
    previewUrl: pathToPreview(filePath),
    fileName,
  };
}

export function generatedVideoThumbnailAssets(paths: string[]): CarouselThumbnailAsset[] {
  return paths.map((filePath, index) => ({
    ...customThumbnailFromPath(filePath),
    label: `Frame ${index + 1}`,
  }));
}

export function thumbnailMatchesSlide(
  thumb: CarouselThumbnailAsset,
  slideFilePath?: string,
  videoThumbnailPath?: string
): boolean {
  const resolveThumbPath = (): string | null => {
    if (thumb.id.startsWith("custom:")) return thumb.id.slice("custom:".length);
    return null;
  };

  if (videoThumbnailPath?.trim()) {
    const thumbPath = resolveThumbPath();
    if (thumbPath && thumbPath === videoThumbnailPath.trim()) return true;
    const slideName = videoThumbnailPath.split(/[/\\]/).pop() ?? videoThumbnailPath;
    return slideName === thumb.fileName;
  }

  if (!slideFilePath?.trim()) return false;
  const slideName = slideFilePath.split(/[/\\]/).pop() ?? slideFilePath;
  return slideName === thumb.fileName || slideFilePath === thumb.id.replace(/^custom:/, "");
}

import type { AppSettings, ProcessResponse } from "@renderer/api";

const VIDEO_PATH_RE = /\.(mp4|mov|mkv|webm|m4v)$/i;
const IMAGE_PATH_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

export function isFacebookUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./, "");
    return /^(facebook\.com|fb\.watch|fb\.com|m\.facebook\.com)$/i.test(host);
  } catch {
    return false;
  }
}

export function buildProcessMediaRequest(url: string, settings: AppSettings) {
  return {
    url: url.trim(),
    preset: settings.preset,
    outDir: settings.outDir,
    enhance: settings.enhance,
    format: settings.format,
    features: settings.enhanceFeatures,
    youtube: settings.youtube,
    pinterest: settings.pinterest,
    packFolders: settings.packFolders !== false,
    naming: settings.naming ?? undefined,
  };
}

export function extractTitleFromProcess(
  response: Pick<ProcessResponse, "pack" | "results">,
  picked?: { title?: string }
): string | undefined {
  const fromPicked = picked?.title?.trim();
  if (fromPicked) return fromPicked;
  const fromPack = response.pack?.title?.trim();
  if (fromPack) return fromPack;
  for (const result of response.results) {
    const title = result.title?.trim();
    if (title) return title;
  }
  return undefined;
}

export function isVideoPath(filePath: string): boolean {
  return VIDEO_PATH_RE.test(filePath);
}

export function isImagePath(filePath: string): boolean {
  return IMAGE_PATH_RE.test(filePath);
}

export function pickVideoFromProcessResults(
  results: Array<{ outPath: string; title?: string; kind?: string }>
): { filePath: string; title?: string } | null {
  for (const result of results) {
    const filePath = result.outPath?.trim();
    if (!filePath) continue;
    if (result.kind === "video") {
      return { filePath, title: result.title };
    }
  }
  for (const result of results) {
    const filePath = result.outPath?.trim();
    if (!filePath) continue;
    if (isVideoPath(filePath)) {
      return { filePath, title: result.title };
    }
  }
  return null;
}

export function pickImageFromProcessResults(
  results: Array<{ outPath: string; title?: string; kind?: string }>
): { filePath: string; title?: string } | null {
  for (const result of results) {
    const filePath = result.outPath?.trim();
    if (!filePath) continue;
    if (result.kind === "image" || isImagePath(filePath)) {
      return { filePath, title: result.title };
    }
  }
  return null;
}

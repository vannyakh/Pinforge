import type { YoutubeQuality } from "@renderer/api";

const KNOWN = new Set(["4320", "2160", "1440", "1080", "720", "480", "360"]);

const FALLBACK: YoutubeQuality[] = ["best", "2160", "1440", "1080", "720", "480", "360"];

/** Best + heights from extract preview, or the default ladder (4320 only when available). */
export function youtubeQualityChoices(availableHeights?: number[]): YoutubeQuality[] {
  if (!availableHeights?.length) return [...FALLBACK];
  const fromPreview: YoutubeQuality[] = [];
  for (const h of availableHeights) {
    const key = String(h);
    if (!KNOWN.has(key)) continue;
    const q = key as YoutubeQuality;
    if (!fromPreview.includes(q)) fromPreview.push(q);
  }
  return fromPreview.length ? (["best", ...fromPreview] as YoutubeQuality[]) : [...FALLBACK];
}

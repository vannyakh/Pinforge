/**
 * Pinterest video_list / storyPin stream selection.
 * Patterns aligned with github.com/motebaya/pinterest-js (V_720P, V_HLSV*).
 */

import { sanitizeMediaUrl } from "./pinimg";

type VideoCandidate = { url: string; width: number; height: number; hls: boolean; key: string };

/** Width hint from keys like V_720P / V_HLSV3_MOBILE. */
function widthFromVideoKey(key: string): number {
  const m = key.match(/(\d{3,4})P/i);
  if (m?.[1]) return Number(m[1]);
  if (/HLSV4/i.test(key)) return 1080;
  if (/HLSV3/i.test(key)) return 720;
  if (/HLS/i.test(key)) return 720;
  return 0;
}

export function extractVideoList(videos: unknown, allowHls: boolean): VideoCandidate[] {
  if (!videos || typeof videos !== "object") return [];
  const root = videos as Record<string, unknown>;

  // storyPin desktop shape: videoDataV2.videoList720P.v720P
  const dataV2 = root.videoDataV2;
  if (dataV2 && typeof dataV2 === "object") {
    return extractVideoList(dataV2, allowHls);
  }
  const list720 = root.videoList720P;
  if (list720 && typeof list720 === "object") {
    const bag = list720 as Record<string, unknown>;
    if (bag.v720P || bag.V_720P) {
      return extractVideoList({ video_list: { V_720P: bag.v720P ?? bag.V_720P } }, allowHls);
    }
    return extractVideoList({ video_list: bag }, allowHls);
  }

  const list =
    (root.video_list as Record<string, unknown> | undefined) ??
    (root.videoList as Record<string, unknown> | undefined) ??
    (root as Record<string, unknown>);
  if (!list || typeof list !== "object") return [];

  const out: VideoCandidate[] = [];
  for (const [key, raw] of Object.entries(list)) {
    if (!raw || typeof raw !== "object") continue;
    if (
      /^(video_list|videoList|videoList720P|videoDataV2)$/i.test(key) &&
      !(raw as { url?: unknown }).url
    ) {
      out.push(...extractVideoList({ video_list: raw }, allowHls));
      continue;
    }
    const item = raw as Record<string, unknown>;
    const url = typeof item.url === "string" ? sanitizeMediaUrl(item.url) : "";
    if (!/^https?:\/\//i.test(url)) continue;
    const hls =
      /\.m3u8(\?|$)/i.test(url) ||
      /HLS/i.test(key) ||
      item.need_convert === true ||
      item.needConvert === true;
    if (hls && !allowHls) continue;
    const width =
      typeof item.width === "number" && item.width > 0 ? item.width : widthFromVideoKey(key);
    const height = typeof item.height === "number" ? item.height : 0;
    out.push({ url, width, height, hls, key });
  }
  return out;
}

/**
 * Prefer progressive MP4 (V_720P+) when available; otherwise HLS when ffmpeg is on.
 * Matches pinterest-js reliability while keeping higher-res HLS when no MP4 exists.
 */
export function pickBestVideo(candidates: VideoCandidate[], allowHls: boolean): string | null {
  if (!candidates.length) return null;
  const byRes = (a: VideoCandidate, b: VideoCandidate) =>
    b.width * Math.max(b.height, 1) - a.width * Math.max(a.height, 1) || b.width - a.width;

  const mp4 = candidates.filter((c) => !c.hls).sort(byRes);
  const preferredMp4 = mp4.find((c) => /V_720P|720P|V_1080P|1080P/i.test(c.key)) ?? mp4[0];
  if (preferredMp4) return preferredMp4.url;

  if (allowHls) {
    const hls = candidates.filter((c) => c.hls).sort(byRes);
    const preferredHls =
      hls.find((c) => /HLSV4/i.test(c.key)) ?? hls.find((c) => /HLSV3/i.test(c.key)) ?? hls[0];
    if (preferredHls) return preferredHls.url;
  }
  return null;
}

export function pickPinterestVideoUrl(videos: unknown, allowHls: boolean): string | null {
  return pickBestVideo(extractVideoList(videos, allowHls), allowHls);
}

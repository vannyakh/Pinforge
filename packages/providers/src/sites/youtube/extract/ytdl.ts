import type { FormatPreset, ResolvedMedia, YoutubeQuality } from "@pinforge/types";
import { toResolved } from "@pinforge/download";
import { heightFromLabel, qualityCap } from "../formats";

// Dynamic import — avoid bundling undici/node:sqlite into Electron main.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type YtdlApi = any;

let ytdlMod: YtdlApi | null = null;

async function getYtdl(): Promise<YtdlApi> {
  if (!ytdlMod) {
    const mod = await import("@distube/ytdl-core");
    ytdlMod = (mod as { default?: YtdlApi }).default ?? mod;
  }
  return ytdlMod;
}

export async function extractYouTubeId(url: string): Promise<string | null> {
  try {
    const ytdl = await getYtdl();
    if (ytdl.validateURL(url)) return ytdl.getVideoID(url);
  } catch {
    /* fall through */
  }
  try {
    const u = new URL(url.trim());
    if (/youtu\.be$/i.test(u.hostname)) {
      return u.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const shorts = u.pathname.match(/\/(?:shorts|embed|live)\/([^/?#]+)/i);
    return shorts?.[1] ?? null;
  } catch {
    return null;
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function extractViaYtdl(
  url: string,
  format: FormatPreset,
  quality: YoutubeQuality = "best"
): Promise<ResolvedMedia> {
  const ytdl = await getYtdl();
  const info = await ytdl.getInfo(url);
  const title = info.videoDetails.title ?? info.videoDetails.videoId;
  const cap = qualityCap(quality);

  let formats =
    format === "audio-only"
      ? ytdl.filterFormats(info.formats, "audioonly")
      : ytdl.filterFormats(info.formats, "audioandvideo");

  if (!formats.length && format === "mp4") {
    formats = ytdl.filterFormats(
      info.formats,
      (f: { container?: string; hasVideo?: boolean; hasAudio?: boolean }) =>
        f.container === "mp4" && Boolean(f.hasVideo) && Boolean(f.hasAudio)
    );
  }
  if (!formats.length && format !== "audio-only") {
    formats = ytdl.filterFormats(
      info.formats,
      (f: { hasVideo?: boolean; hasAudio?: boolean }) => Boolean(f.hasVideo) && Boolean(f.hasAudio)
    );
  }
  if (!formats.length) {
    formats = ytdl.filterFormats(info.formats, "audioonly");
  }
  if (!formats.length) throw new Error("No downloadable formats");

  const heightOf = (f: { qualityLabel?: string; height?: number }) =>
    heightFromLabel(f.qualityLabel, f.height);
  const withinCap = (f: { qualityLabel?: string; height?: number }) => {
    if (cap == null || format === "audio-only") return true;
    const h = heightOf(f);
    return h <= 0 || h <= cap;
  };

  const chosen =
    formats
      .filter((f: { url?: string }) => Boolean(f.url))
      .filter(withinCap)
      .sort(
        (
          a: { bitrate?: number; qualityLabel?: string; height?: number },
          b: { bitrate?: number; qualityLabel?: string; height?: number }
        ) => heightOf(b) - heightOf(a) || (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)
      )[0] ??
    formats
      .filter((f: { url?: string }) => Boolean(f.url))
      .sort(
        (a: { bitrate?: number }, b: { bitrate?: number }) =>
          (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)
      )[0];
  if (!chosen) throw new Error("No format with a direct URL");

  const stream = ytdl.downloadFromInfo(info, { format: chosen });
  const buffer = await streamToBuffer(stream);
  if (!buffer.length) throw new Error("Empty download");

  const ext = chosen.container || (format === "audio-only" ? "m4a" : "mp4");
  return toResolved("youtube", url, buffer, ext, title, format);
}

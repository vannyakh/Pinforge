import type { FormatPreset, ResolvedMedia } from "../../types";
import { fetchBinary, toResolved } from "./http";

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

/** Public Invidious / Piped-compatible bases (best-effort; override in settings). */
const DEFAULT_EXTRACTOR_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://pipedapi.kavin.rocks",
];

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

/**
 * YouTube via built-in JS extractor, then Invidious/Piped service fallbacks.
 * No yt-dlp. Set `extractorUrl` to force a specific service instance.
 */
export async function extractYouTubeViaPiped(
  url: string,
  opts: { format?: FormatPreset; extractorUrl?: string } = {}
): Promise<ResolvedMedia> {
  const format = opts.format ?? "best";
  const id = await extractYouTubeId(url);
  if (!id) throw new Error("Could not parse YouTube video id from URL");

  const errors: string[] = [];

  if (opts.extractorUrl?.trim()) {
    try {
      return await extractViaService(id, url, format, opts.extractorUrl.trim());
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  try {
    return await extractViaYtdl(url, format);
  } catch (e) {
    errors.push(`local: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!opts.extractorUrl?.trim()) {
    for (const instance of DEFAULT_EXTRACTOR_INSTANCES) {
      try {
        return await extractViaService(id, url, format, instance);
      } catch (e) {
        errors.push(`${instance}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  throw new Error(
    `YouTube download failed. Set a working extractor API URL in Settings → Output & format. (${errors.slice(-2).join(" · ")})`
  );
}

async function extractViaYtdl(url: string, format: FormatPreset): Promise<ResolvedMedia> {
  const ytdl = await getYtdl();
  const info = await ytdl.getInfo(url);
  const title = info.videoDetails.title ?? info.videoDetails.videoId;

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

  const chosen = formats.sort(
    (a: { bitrate?: number }, b: { bitrate?: number }) =>
      (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)
  )[0]!;

  const stream = ytdl.downloadFromInfo(info, { format: chosen });
  const buffer = await streamToBuffer(stream);
  if (!buffer.length) throw new Error("Empty download");

  const ext = chosen.container || (format === "audio-only" ? "m4a" : "mp4");
  return toResolved("youtube", url, buffer, ext, title, format);
}

type ServiceFormat = {
  url?: string;
  itag?: string | number;
  quality?: string;
  qualityLabel?: string;
  container?: string;
  type?: string;
  encoding?: string;
  bitrate?: number | string;
  audioQuality?: string;
  videoOnly?: boolean;
  audioOnly?: boolean;
  format?: string;
  mimeType?: string;
};

async function extractViaService(
  id: string,
  sourceUrl: string,
  format: FormatPreset,
  baseUrl: string
): Promise<ResolvedMedia> {
  const base = baseUrl.replace(/\/$/, "");

  try {
    const res = await fetch(`${base}/api/v1/videos/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json", "User-Agent": "Pinforge/0.1" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        formatStreams?: ServiceFormat[];
        adaptiveFormats?: ServiceFormat[];
      };
      return pickAndDownload(
        sourceUrl,
        data.title ?? id,
        format,
        data.formatStreams ?? [],
        data.adaptiveFormats ?? []
      );
    }
  } catch {
    /* try Piped next */
  }

  const res = await fetch(`${base}/streams/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json", "User-Agent": "Pinforge/0.1" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as {
    title?: string;
    videoStreams?: ServiceFormat[];
    audioStreams?: ServiceFormat[];
  };
  const combined = [
    ...(data.videoStreams ?? []).map((s) => ({
      ...s,
      videoOnly: s.videoOnly ?? false,
      audioOnly: s.audioOnly ?? false,
    })),
    ...(data.audioStreams ?? []).map((s) => ({ ...s, audioOnly: true })),
  ];
  return pickAndDownload(sourceUrl, data.title ?? id, format, combined, []);
}

async function pickAndDownload(
  sourceUrl: string,
  title: string,
  format: FormatPreset,
  muxed: ServiceFormat[],
  adaptive: ServiceFormat[]
): Promise<ResolvedMedia> {
  let pick: ServiceFormat | undefined;

  if (format === "audio-only") {
    pick = [...adaptive, ...muxed]
      .filter((s) => s.url && (s.audioOnly || s.audioQuality || /audio\//i.test(s.type ?? s.mimeType ?? "")))
      .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))[0];
  } else {
    pick = muxed
      .filter((s) => s.url && !s.videoOnly)
      .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))[0];
    if (!pick) {
      pick = muxed.find((s) => s.url) ?? adaptive.find((s) => s.url && !s.audioOnly);
    }
  }

  if (!pick?.url) throw new Error("No stream URL from extractor service");

  const { buffer, ext } = await fetchBinary(pick.url, {
    referer: "https://www.youtube.com/",
    accept: format === "audio-only" ? "audio/*,*/*;q=0.8" : "video/mp4,video/*,*/*;q=0.8",
  });
  const outExt = pick.container || (format === "audio-only" ? "m4a" : ext || "mp4");
  return toResolved("youtube", sourceUrl, buffer, outExt, title, format);
}

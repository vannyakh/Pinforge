import type { FormatPreset, ResolvedMedia, YoutubeQuality } from "../../types";
import { heightFromLabel, qualityCap } from "../youtube/formats";
import { fetchBinary, toResolved } from "./http";

// Dynamic import — avoid bundling undici/node:sqlite into Electron main.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type YtdlApi = any;

let ytdlMod: YtdlApi | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let innertubeMod: any = null;

async function getYtdl(): Promise<YtdlApi> {
  if (!ytdlMod) {
    const mod = await import("@distube/ytdl-core");
    ytdlMod = (mod as { default?: YtdlApi }).default ?? mod;
  }
  return ytdlMod;
}

async function getInnertube() {
  if (!innertubeMod) {
    innertubeMod = await import("youtubei.js");
  }
  return innertubeMod as typeof import("youtubei.js");
}

/** Curated Piped / Invidious bases (public instances change often). */
const DEFAULT_EXTRACTOR_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.leptons.xyz",
  "https://api.piped.yt",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi-libre.kavin.rocks",
  "https://inv.nadeko.net",
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
 * YouTube via Innertube (Android client) → ytdl → Piped/Invidious.
 * Set `extractorUrl` to force a specific service instance first.
 */
export async function extractYouTubeViaPiped(
  url: string,
  opts: {
    format?: FormatPreset;
    quality?: YoutubeQuality;
    extractorUrl?: string;
    fragmentConcurrency?: number;
    signal?: AbortSignal;
  } = {}
): Promise<ResolvedMedia> {
  const format = opts.format ?? "best";
  const quality = opts.quality ?? "best";
  const id = await extractYouTubeId(url);
  if (!id) throw new Error("Could not parse YouTube video id from URL");

  const errors: string[] = [];

  if (opts.extractorUrl?.trim()) {
    try {
      return await extractViaService(id, url, format, opts.extractorUrl.trim(), opts, quality);
    } catch (e) {
      errors.push(`custom: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    return await extractViaInnertube(id, url, format, opts, quality);
  } catch (e) {
    errors.push(`innertube: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    return await extractViaYtdl(url, format, quality);
  } catch (e) {
    errors.push(`local: ${e instanceof Error ? e.message : String(e)}`);
  }

  const instances = await listExtractorInstances();
  for (const instance of instances) {
    if (opts.extractorUrl?.trim() && instance === opts.extractorUrl.trim().replace(/\/$/, "")) {
      continue;
    }
    try {
      return await extractViaService(id, url, format, instance, opts, quality);
    } catch (e) {
      errors.push(`${instance}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(
    `YouTube download failed. Set a working Piped/Invidious API URL in Settings → System (Extractor API). (${summarizeErrors(errors)})`
  );
}

function summarizeErrors(errors: string[]): string {
  const preferred = errors.filter(
    (e) => e.startsWith("innertube:") || e.startsWith("local:") || e.startsWith("custom:")
  );
  const pick = preferred.length ? preferred : errors;
  return pick.slice(0, 3).join(" · ");
}

async function listExtractorInstances(): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string) => {
    const base = u.replace(/\/$/, "");
    if (!base || seen.has(base)) return;
    seen.add(base);
    out.push(base);
  };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch("https://piped-instances.kavin.rocks/", {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const list = (await res.json()) as Array<{ api_url?: string; uptime_24h?: number }>;
      list
        .filter((i) => i.api_url && (i.uptime_24h ?? 0) > 50)
        .sort((a, b) => (b.uptime_24h ?? 0) - (a.uptime_24h ?? 0))
        .forEach((i) => add(i.api_url!));
    }
  } catch {
    /* use curated list */
  }

  for (const u of DEFAULT_EXTRACTOR_INSTANCES) add(u);
  return out;
}

type YtFormatLike = {
  itag?: number;
  url?: string;
  mime_type?: string;
  quality_label?: string;
  has_video?: boolean;
  has_audio?: boolean;
  bitrate?: number;
  average_bitrate?: number;
  width?: number;
  height?: number;
};

async function extractViaInnertube(
  id: string,
  sourceUrl: string,
  format: FormatPreset,
  opts: { fragmentConcurrency?: number; signal?: AbortSignal } = {},
  quality: YoutubeQuality = "best"
): Promise<ResolvedMedia> {
  const { Innertube, ClientType, UniversalCache } = await getInnertube();
  const clients = ["ANDROID", "ANDROID_VR", "IOS"] as const;

  let lastError: Error | null = null;
  for (const client of clients) {
    try {
      const yt = await Innertube.create({
        cache: new UniversalCache(false),
        client_type: ClientType[client],
      });
      const info = await yt.getBasicInfo(id, { client });
      const title = info.basic_info?.title ?? id;
      const formats: YtFormatLike[] = [
        ...(info.streaming_data?.formats ?? []),
        ...(info.streaming_data?.adaptive_formats ?? []),
      ].filter((f: YtFormatLike) => Boolean(f.url));

      if (!formats.length) {
        throw new Error(`No direct stream URLs (${String(client)})`);
      }

      const pick = pickInnertubeFormat(formats, format, quality);
      if (!pick?.url) throw new Error("No matching format URL");

      const { buffer, ext } = await fetchBinary(pick.url, {
        referer: "https://www.youtube.com/",
        accept: format === "audio-only" ? "audio/*,*/*;q=0.8" : "video/mp4,video/*,*/*;q=0.8",
        concurrency: opts.fragmentConcurrency ?? 4,
        signal: opts.signal,
      });
      if (!buffer.length) throw new Error("Empty download");

      const outExt =
        extFromMime(pick.mime_type) ||
        (format === "audio-only" ? "m4a" : ext || "mp4");
      return toResolved("youtube", sourceUrl, buffer, outExt, title, format);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Innertube extraction failed");
}

function pickInnertubeFormat(
  formats: YtFormatLike[],
  format: FormatPreset,
  quality: YoutubeQuality = "best"
): YtFormatLike | undefined {
  const bitrate = (f: YtFormatLike) => Number(f.average_bitrate ?? f.bitrate ?? 0);
  const cap = qualityCap(quality);
  const heightOk = (f: YtFormatLike) => {
    if (cap == null) return true;
    const h = heightFromLabel(f.quality_label, f.height);
    return h <= 0 || h <= cap;
  };
  if (format === "audio-only") {
    const audio = formats
      .filter((f) => f.has_audio && !f.has_video)
      .sort((a, b) => bitrate(b) - bitrate(a));
    if (audio[0]) return audio[0];
    // Progressive muxed still has audio — usable fallback
    return formats
      .filter((f) => f.has_audio)
      .sort((a, b) => bitrate(b) - bitrate(a))[0];
  }

  const muxed = formats
    .filter((f) => f.has_video && f.has_audio && heightOk(f))
    .sort(
      (a, b) =>
        heightFromLabel(b.quality_label, b.height) - heightFromLabel(a.quality_label, a.height) ||
        bitrate(b) - bitrate(a)
    );
  if (muxed[0]) return muxed[0];
  const anyMuxed = formats
    .filter((f) => f.has_video && f.has_audio)
    .sort((a, b) => bitrate(b) - bitrate(a));
  if (anyMuxed[0]) return anyMuxed[0];
  return formats.find((f) => f.has_video && heightOk(f)) ?? formats.find((f) => f.has_video) ?? formats[0];
}

function extFromMime(mime?: string): string | undefined {
  if (!mime) return undefined;
  if (/webm/i.test(mime)) return "webm";
  if (/mp4|m4a|aac/i.test(mime)) return /audio\//i.test(mime) ? "m4a" : "mp4";
  return undefined;
}

async function extractViaYtdl(
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

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Pinforge/0.1" },
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!/^\s*[{[]/.test(text)) throw new Error("Unexpected token (HTML response)");
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function extractViaService(
  id: string,
  sourceUrl: string,
  format: FormatPreset,
  baseUrl: string,
  opts: { fragmentConcurrency?: number; signal?: AbortSignal } = {},
  quality: YoutubeQuality = "best"
): Promise<ResolvedMedia> {
  const base = baseUrl.replace(/\/$/, "");

  try {
    const data = (await fetchJson(`${base}/api/v1/videos/${encodeURIComponent(id)}`)) as {
      title?: string;
      formatStreams?: ServiceFormat[];
      adaptiveFormats?: ServiceFormat[];
      error?: string;
    };
    if (data.error) throw new Error(data.error);
    return pickAndDownload(
      sourceUrl,
      data.title ?? id,
      format,
      data.formatStreams ?? [],
      data.adaptiveFormats ?? [],
      opts,
      quality
    );
  } catch {
    /* try Piped next */
  }

  const data = (await fetchJson(`${base}/streams/${encodeURIComponent(id)}`)) as {
    title?: string;
    videoStreams?: ServiceFormat[];
    audioStreams?: ServiceFormat[];
    error?: string;
    message?: string;
  };
  if (data.error || data.message === "Error 502: Bad gateway") {
    throw new Error(data.error || data.message || "Upstream error");
  }
  const combined = [
    ...(data.videoStreams ?? []).map((s) => ({
      ...s,
      videoOnly: s.videoOnly ?? false,
      audioOnly: s.audioOnly ?? false,
    })),
    ...(data.audioStreams ?? []).map((s) => ({ ...s, audioOnly: true })),
  ];
  return pickAndDownload(sourceUrl, data.title ?? id, format, combined, [], opts, quality);
}

async function pickAndDownload(
  sourceUrl: string,
  title: string,
  format: FormatPreset,
  muxed: ServiceFormat[],
  adaptive: ServiceFormat[],
  opts: { fragmentConcurrency?: number; signal?: AbortSignal } = {},
  quality: YoutubeQuality = "best"
): Promise<ResolvedMedia> {
  let pick: ServiceFormat | undefined;
  const cap = qualityCap(quality);
  const withinCap = (s: ServiceFormat) => {
    if (cap == null || format === "audio-only") return true;
    const h = heightFromLabel(s.qualityLabel ?? s.quality);
    return h <= 0 || h <= cap;
  };

  if (format === "audio-only") {
    pick = [...adaptive, ...muxed]
      .filter((s) => s.url && (s.audioOnly || s.audioQuality || /audio\//i.test(s.type ?? s.mimeType ?? "")))
      .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))[0];
  } else {
    pick = muxed
      .filter((s) => s.url && !s.videoOnly && withinCap(s))
      .sort(
        (a, b) =>
          heightFromLabel(b.qualityLabel ?? b.quality) - heightFromLabel(a.qualityLabel ?? a.quality) ||
          Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0)
      )[0];
    if (!pick) {
      pick =
        muxed.filter((s) => s.url && !s.videoOnly).sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))[0] ??
        muxed.find((s) => s.url) ??
        adaptive.find((s) => s.url && !s.audioOnly);
    }
  }

  if (!pick?.url) throw new Error("No stream URL from extractor service");

  const { buffer, ext } = await fetchBinary(pick.url, {
    referer: "https://www.youtube.com/",
    accept: format === "audio-only" ? "audio/*,*/*;q=0.8" : "video/mp4,video/*,*/*;q=0.8",
    concurrency: opts.fragmentConcurrency ?? 4,
    signal: opts.signal,
  });
  const outExt = pick.container || (format === "audio-only" ? "m4a" : ext || "mp4");
  return toResolved("youtube", sourceUrl, buffer, outExt, title, format);
}

import type { FormatPreset, ResolvedMedia, YoutubeQuality } from "@pinforge/types";
import { fetchBinary, toResolved } from "@pinforge/download";
import { heightFromLabel, qualityCap } from "../formats";

/** Curated Piped / Invidious bases (public instances change often). */
const DEFAULT_EXTRACTOR_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.leptons.xyz",
  "https://api.piped.yt",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi-libre.kavin.rocks",
  "https://inv.nadeko.net",
];

export async function listExtractorInstances(): Promise<string[]> {
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
      .filter(
        (s) =>
          s.url && (s.audioOnly || s.audioQuality || /audio\//i.test(s.type ?? s.mimeType ?? ""))
      )
      .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))[0];
  } else {
    pick = muxed
      .filter((s) => s.url && !s.videoOnly && withinCap(s))
      .sort(
        (a, b) =>
          heightFromLabel(b.qualityLabel ?? b.quality) -
            heightFromLabel(a.qualityLabel ?? a.quality) ||
          Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0)
      )[0];
    if (!pick) {
      pick =
        muxed
          .filter((s) => s.url && !s.videoOnly)
          .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))[0] ??
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

export async function extractViaService(
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

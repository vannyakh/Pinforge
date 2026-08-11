import { extractYouTubeId } from "../extract";
import { heightFromLabel, normalizeStreamFlags, type YtStreamFormat } from "../formats";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let innertubeMod: any = null;

async function getInnertube() {
  if (!innertubeMod) {
    innertubeMod = await import("youtubei.js");
  }
  return innertubeMod as typeof import("youtubei.js");
}

export type CaptionTrack = {
  language_code?: string;
  name?: { text?: string } | string;
  base_url?: string;
  url?: string;
};

export type VideoMeta = {
  id: string;
  title: string;
  channel?: string;
  description?: string;
  uploadDate?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  formats: YtStreamFormat[];
  captions: CaptionTrack[];
};

export type YoutubeVideoPreview = {
  id: string;
  title: string;
  channel?: string;
  description?: string;
  durationSec?: number;
  durationText?: string;
  thumbnailUrl?: string;
  qualities: number[];
  captionLangs: string[];
};

function formatDurationText(sec?: number): string | undefined {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return undefined;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function uniqueHeights(formats: YtStreamFormat[]): number[] {
  const set = new Set<number>();
  for (const f of formats) {
    if (!f.has_video) continue;
    const h = heightFromLabel(f.quality_label, f.height);
    if (h > 0) set.add(h);
  }
  return [...set].sort((a, b) => b - a);
}

export async function resolveInnertubeMeta(id: string): Promise<VideoMeta> {
  const { Innertube, ClientType, UniversalCache } = await getInnertube();
  const clients = ["ANDROID", "ANDROID_VR", "IOS"] as const;
  let lastError: Error | null = null;

  for (const client of clients) {
    try {
      const clientType = ClientType[client];
      if (clientType == null) continue;
      const yt = await Innertube.create({
        cache: new UniversalCache(false),
        client_type: clientType,
      });
      const info = await yt.getBasicInfo(id, { client });
      const basic: any = info.basic_info ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = (yt as any).session?.player;
      const rawFormats = [
        ...(info.streaming_data?.formats ?? []),
        ...(info.streaming_data?.adaptive_formats ?? []),
      ];
      const formats: YtStreamFormat[] = [];
      for (const f of rawFormats) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fmt = f as any;
        let url: string | undefined = typeof fmt.url === "string" ? fmt.url : undefined;
        if (!url && typeof fmt.decipher === "function") {
          try {
            url = (await fmt.decipher(player)) || undefined;
          } catch {
            url = undefined;
          }
        }
        if (!url) continue;
        formats.push(
          normalizeStreamFlags({
            itag: fmt.itag,
            url,
            mime_type: fmt.mime_type ?? fmt.mimeType,
            quality_label: fmt.quality_label ?? fmt.qualityLabel ?? fmt.quality,
            has_video: fmt.has_video,
            has_audio: fmt.has_audio,
            bitrate: fmt.bitrate,
            average_bitrate: fmt.average_bitrate ?? fmt.averageBitrate,
            width: fmt.width,
            height: fmt.height,
          })
        );
      }

      if (!formats.length) {
        throw new Error(`No stream URLs after decipher (${String(client)})`);
      }

      const thumbs = basic.thumbnail ?? basic.thumbnails;
      let thumbnailUrl: string | undefined;
      if (Array.isArray(thumbs) && thumbs.length) {
        thumbnailUrl = thumbs[thumbs.length - 1]?.url;
      }

      const captions: CaptionTrack[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const captionBag: any = info.captions ?? {};
      const captionTracks = captionBag.caption_tracks ?? captionBag.captionTracks ?? [];
      if (Array.isArray(captionTracks)) {
        for (const t of captionTracks) {
          captions.push({
            language_code: t.language_code ?? t.languageCode,
            name: t.name,
            base_url: t.base_url ?? t.baseUrl,
            url: t.url,
          });
        }
      }

      return {
        id,
        title: basic.title ?? id,
        channel: basic.author ?? basic.channel?.name ?? basic.author_name,
        description:
          typeof basic.short_description === "string" ? basic.short_description : undefined,
        uploadDate: basic.start_timestamp ? String(basic.start_timestamp).slice(0, 10) : undefined,
        durationSec:
          typeof basic.duration === "number"
            ? basic.duration
            : typeof basic.duration_seconds === "number"
              ? basic.duration_seconds
              : undefined,
        thumbnailUrl,
        formats,
        captions,
      };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Innertube extraction failed");
}

/** Lightweight video info for Home extract preview (title, channel, duration, qualities). */
export async function previewYouTubeVideo(url: string): Promise<YoutubeVideoPreview> {
  const id = await extractYouTubeId(url);
  if (!id) throw new Error("Could not parse YouTube video id from URL");
  const meta = await resolveInnertubeMeta(id);
  const captionLangs = [
    ...new Set(meta.captions.map((t) => (t.language_code || "").trim()).filter(Boolean)),
  ];
  return {
    id: meta.id,
    title: meta.title,
    channel: meta.channel,
    description: meta.description,
    durationSec: meta.durationSec,
    durationText: formatDurationText(meta.durationSec),
    thumbnailUrl: meta.thumbnailUrl,
    qualities: uniqueHeights(meta.formats),
    captionLangs,
  };
}

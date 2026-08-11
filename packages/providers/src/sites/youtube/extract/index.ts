import type { FormatPreset, ResolvedMedia, YoutubeQuality } from "@pinforge/types";
import { extractViaInnertube } from "./innertube";
import { extractViaService, listExtractorInstances } from "./serviceFallback";
import { extractYouTubeId, extractViaYtdl } from "./ytdl";

export { extractYouTubeId } from "./ytdl";

function summarizeErrors(errors: string[]): string {
  const preferred = errors.filter(
    (e) => e.startsWith("innertube:") || e.startsWith("local:") || e.startsWith("custom:")
  );
  const pick = preferred.length ? preferred : errors;
  return pick.slice(0, 3).join(" · ");
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

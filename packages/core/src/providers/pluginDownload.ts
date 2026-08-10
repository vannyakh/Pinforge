import type { FormatPreset, ProviderId, ResolvedMedia } from "../types";
import type { ResolveContext } from "./types";
import type { MediaInfo } from "./plugin";
import { fetchBinary, toResolved } from "./extractors/http";

/**
 * Default plugin download path — HTTP Range via MediaCore fragment/resume stack.
 */
export async function mediaInfoToResolved(
  provider: ProviderId,
  sourceUrl: string,
  info: MediaInfo,
  ctx?: ResolveContext
): Promise<ResolvedMedia | ResolvedMedia[]> {
  const format: FormatPreset =
    ctx?.format === "audio-only" && info.kind !== "audio" ? "best" : (ctx?.format ?? "best");
  const referer = (() => {
    try {
      return new URL(sourceUrl).origin + "/";
    } catch {
      return undefined;
    }
  })();

  const results: ResolvedMedia[] = [];
  const urls = info.urls.length ? info.urls : [];
  if (!urls.length) {
    throw new Error(`${provider}: extract returned no media URLs`);
  }

  for (let i = 0; i < urls.length; i++) {
    const mediaUrl = urls[i]!;
    const accept =
      info.kind === "image"
        ? "image/*,*/*;q=0.8"
        : info.kind === "audio"
          ? "audio/*,*/*;q=0.8"
          : "video/mp4,video/*,*/*;q=0.8";
    const { buffer, ext } = await fetchBinary(mediaUrl, {
      referer,
      accept,
      concurrency: ctx?.fragmentConcurrency,
      signal: ctx?.signal,
    });
    const title =
      urls.length > 1
        ? `${info.title ?? provider} (${i + 1})`
        : info.title;
    const resolved = toResolved(
      provider,
      sourceUrl,
      buffer,
      info.ext || ext,
      title,
      format
    );
    resolved.id = info.id ? (urls.length > 1 ? `${info.id}_${i}` : info.id) : undefined;
    resolved.channel = info.channel;
    resolved.kind = info.kind;
    results.push(resolved);
  }

  return results.length === 1 ? results[0]! : results;
}

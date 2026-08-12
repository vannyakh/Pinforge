import type { FormatPreset, PresetName, YoutubeDownloadOptions } from "@pinforge/core/types";
import { DEFAULT_YOUTUBE_OPTIONS } from "@pinforge/core/types";
import { getStore, type PendingQueueJob } from "./store";

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

export function extractMediaUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.match(URL_RE) ?? []) {
    const url = raw.replace(/[),.;!?]+$/g, "");
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function defaultQueueOpts(
  outDir: string,
  override?: { format?: FormatPreset; youtube?: Partial<YoutubeDownloadOptions> }
): PendingQueueJob["opts"] {
  const store = getStore();
  const youtube = { ...DEFAULT_YOUTUBE_OPTIONS, ...store.get("youtube"), ...override?.youtube };
  return {
    enhance: store.get("enhance"),
    format: override?.format ?? (store.get("format") as FormatPreset),
    preset: store.get("preset") as PresetName,
    outDir,
    youtube: {
      quality: youtube.quality,
      audioContainer: youtube.audioContainer,
      subtitles: youtube.subtitles,
    },
  };
}

/** Append unique URLs to the persisted Tasks queue (main-process safe). */
export function appendToPendingQueue(
  urls: string[],
  override?: { format?: FormatPreset; youtube?: Partial<YoutubeDownloadOptions> }
): number {
  const store = getStore();
  const outDir = store.get("outDir");
  if (!outDir?.trim()) return 0;

  const pending = store.get("pendingQueue") ?? [];
  const packUrls = new Set(store.get("packs").map((p) => p.url));
  const existing = new Set([...pending.map((q) => q.url), ...packUrls]);
  const opts = defaultQueueOpts(outDir, override);
  const next: PendingQueueJob[] = [...pending];
  let added = 0;

  for (const url of urls) {
    if (existing.has(url)) continue;
    existing.add(url);
    next.push({
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url,
      addedAt: Date.now(),
      opts,
    });
    added += 1;
  }

  if (added > 0) store.set("pendingQueue", next);
  return added;
}

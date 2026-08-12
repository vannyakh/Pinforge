import type { FormatPreset, PresetName, YoutubeDownloadOptions } from "@pinforge/core/types";
import { DEFAULT_YOUTUBE_OPTIONS } from "@pinforge/core/types";
import { cleanUrl, isHttpUrl } from "@pinforge/common";
import { getStore, type PendingQueueJob } from "./store";

/** Absolute http(s) URLs. */
const ABS_URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
/** Scheme-less hosts users often paste (pin.it/…, youtube.com/…, bilibili.com/…). */
const BARE_HOST_RE =
  /(?:^|[\s<(["'])((?:www\.)?(?:pin\.it|youtu\.be|(?:[\w-]+\.)?(?:youtube|youtu|tiktok|instagram|facebook|fb|pinterest|bilibili|vimeo|twitter|x|soundcloud|twitch|reddit)\.[\w.]+)\/[^\s<>"'`]*)/gi;

/**
 * Extract media URLs from free text — same surface the desktop Home/Tasks paste path expects.
 * Accepts absolute http(s) and common scheme-less host paths.
 */
export function extractMediaUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string) => {
    const normalized = normalizeMediaUrl(raw);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  for (const raw of text.match(ABS_URL_RE) ?? []) {
    push(raw.replace(/[),.;!?\]>]+$/g, ""));
  }

  for (const match of text.matchAll(BARE_HOST_RE)) {
    const candidate = match[1];
    if (candidate) push(candidate.replace(/[),.;!?\]>]+$/g, ""));
  }

  // Whole message is a single URL (with or without scheme).
  const trimmed = text.trim();
  if (out.length === 0 && trimmed && !/\s/.test(trimmed)) {
    push(trimmed);
  }

  return out;
}

/** Normalize a pasted URL so remote/desktop provider matching sees the same string. */
export function normalizeMediaUrl(raw: string): string | null {
  let value = cleanUrl(raw).replace(/[),.;!?\]>]+$/g, "");
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) {
    if (/^\/\//.test(value)) value = `https:${value}`;
    else if (/^[\w.-]+\.[a-z]{2,}([/:?]|$)/i.test(value) || /^pin\.it\//i.test(value)) {
      value = `https://${value}`;
    } else {
      return null;
    }
  }

  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // Drop Telegram/tracking-only fragments that break some extractors.
    return u.toString();
  } catch {
    return isHttpUrl(value) ? value : null;
  }
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

  for (const raw of urls) {
    const url = normalizeMediaUrl(raw) ?? raw.trim();
    if (!url || existing.has(url)) continue;
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

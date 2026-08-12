/**
 * Pending Telegram download confirmations (quality / format + confirm buttons).
 */

import type { FormatPreset, YoutubeQuality } from "@pinforge/core/types";
import { DEFAULT_YOUTUBE_OPTIONS } from "@pinforge/core/types";
import { getStore } from "../store";

export type RemotePendingDownload = {
  id: string;
  url: string;
  chatId: number;
  userId: string;
  quality: YoutubeQuality;
  format: FormatPreset;
  qualities: YoutubeQuality[];
  providerId?: string;
  providerLabel?: string;
  title?: string;
  createdAt: number;
};

const PENDING_TTL_MS = 30 * 60 * 1000;
const pending = new Map<string, RemotePendingDownload>();

const QUALITY_SET = new Set<string>(["best", "4320", "2160", "1440", "1080", "720", "480", "360"]);
const FORMAT_SET = new Set<string>(["best", "mp4", "audio-only"]);

export function isYoutubeQuality(value: string): value is YoutubeQuality {
  return QUALITY_SET.has(value);
}

export function isFormatPreset(value: string): value is FormatPreset {
  return FORMAT_SET.has(value);
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, item] of pending) {
    if (now - item.createdAt > PENDING_TTL_MS) pending.delete(id);
  }
}

export function createPendingDownload(
  input: Omit<RemotePendingDownload, "id" | "createdAt" | "quality" | "format"> & {
    quality?: YoutubeQuality;
    format?: FormatPreset;
  }
): RemotePendingDownload {
  pruneExpired();
  const store = getStore();
  const youtube = { ...DEFAULT_YOUTUBE_OPTIONS, ...store.get("youtube") };
  const id = Math.random().toString(36).slice(2, 10);
  const item: RemotePendingDownload = {
    id,
    url: input.url,
    chatId: input.chatId,
    userId: input.userId,
    qualities: input.qualities,
    providerId: input.providerId,
    providerLabel: input.providerLabel,
    title: input.title,
    quality: input.quality ?? youtube.quality ?? "best",
    format: input.format ?? (store.get("format") as FormatPreset) ?? "best",
    createdAt: Date.now(),
  };
  pending.set(id, item);
  return item;
}

export function getPendingDownload(id: string): RemotePendingDownload | undefined {
  pruneExpired();
  return pending.get(id);
}

export function updatePendingDownload(
  id: string,
  patch: Partial<Pick<RemotePendingDownload, "quality" | "format">>
): RemotePendingDownload | undefined {
  const item = pending.get(id);
  if (!item) return undefined;
  const next = { ...item, ...patch };
  pending.set(id, next);
  return next;
}

export function takePendingDownload(id: string): RemotePendingDownload | undefined {
  const item = pending.get(id);
  if (!item) return undefined;
  pending.delete(id);
  return item;
}

export function qualityLabel(q: YoutubeQuality): string {
  return q === "best" ? "Best" : `${q}p`;
}

export function formatLabel(f: FormatPreset): string {
  if (f === "audio-only") return "Audio";
  if (f === "mp4") return "MP4";
  return "Best";
}

export function pendingSummary(item: RemotePendingDownload): string {
  const isYoutube = item.providerId === "youtube";
  const optionLine = isYoutube
    ? `Quality: ${qualityLabel(item.quality)} · Format: ${formatLabel(item.format)}`
    : `Format: ${formatLabel(item.format)}`;
  const lines = [
    item.title ? `Ready: ${item.title}` : "Ready to download",
    item.providerLabel ? `Provider: ${item.providerLabel}` : undefined,
    item.url,
    "",
    optionLine,
    "Pick options below, then Download or Queue.",
  ];
  return lines.filter(Boolean).join("\n");
}

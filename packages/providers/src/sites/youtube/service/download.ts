import fs from "node:fs/promises";
import { downloadToFile } from "@pinforge/download";
import { clearResumeState } from "../resume";
import type { CaptionTrack } from "./meta";

export async function downloadUrlToFile(
  url: string,
  destPath: string,
  opts: {
    concurrency?: number;
    signal?: AbortSignal;
    resume?: boolean;
    accept?: string;
    onProgress?: (info: { downloaded: number; total: number | null }) => void;
  }
): Promise<void> {
  await downloadToFile(url, destPath, {
    referer: "https://www.youtube.com/",
    accept: opts.accept ?? "*/*",
    concurrency: opts.concurrency ?? 4,
    signal: opts.signal,
    resume: opts.resume !== false,
    onProgress: opts.onProgress,
  });
  if (opts.resume !== false) await clearResumeState(destPath);
}

export async function writeCaptionFile(
  track: CaptionTrack,
  destBase: string,
  signal?: AbortSignal
): Promise<string | null> {
  const url = track.base_url || track.url;
  if (!url) return null;
  const sep = url.includes("?") ? "&" : "?";
  const vttUrl = /fmt=/i.test(url) ? url : `${url}${sep}fmt=vtt`;
  const res = await fetch(vttUrl, {
    headers: { Referer: "https://www.youtube.com/", "User-Agent": "Pinforge/0.1" },
    signal,
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.trim()) return null;
  const lang = track.language_code || "und";
  const out = `${destBase}.${lang}.vtt`;
  await fs.writeFile(out, text, "utf8");
  return out;
}

export function pickCaption(tracks: CaptionTrack[], lang: string): CaptionTrack | undefined {
  const want = lang.toLowerCase();
  return (
    tracks.find((t) => (t.language_code ?? "").toLowerCase() === want) ??
    tracks.find((t) => (t.language_code ?? "").toLowerCase().startsWith(want)) ??
    tracks[0]
  );
}

import type { FormatPreset, MediaKind, ProviderId, ResolvedMedia } from "../../types";
import { downloadToBuffer } from "../../download/fragment";

export const EXTRACTOR_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export function hostMatches(url: string, hosts: RegExp): boolean {
  try {
    return hosts.test(new URL(url.trim()).hostname);
  } catch {
    return false;
  }
}

export async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const res = await fetch(url, {
    headers: { ...EXTRACTOR_HEADERS, ...headers },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Failed to fetch page (${res.status}): ${url}`);
  return res.text();
}

export async function fetchBinary(
  url: string,
  opts?: {
    referer?: string;
    accept?: string;
    /** Parallel Range fragments for large files (default 4). */
    concurrency?: number;
    signal?: AbortSignal;
  }
): Promise<{ buffer: Buffer; ext: string; contentType: string | null; usedFragments?: boolean }> {
  const { buffer, contentType, usedFragments } = await downloadToBuffer(url, {
    referer: opts?.referer,
    accept: opts?.accept ?? "*/*",
    concurrency: opts?.concurrency ?? 4,
    signal: opts?.signal,
  });
  const ext = extFromUrlOrType(url, contentType);
  return { buffer, ext, contentType, usedFragments };
}

export function extFromUrlOrType(url: string, contentType: string | null): string {
  if (contentType?.includes("mp4") || contentType?.includes("video")) return "mp4";
  if (contentType?.includes("webm")) return "webm";
  if (contentType?.includes("mpeg") || contentType?.includes("mp3")) return "mp3";
  if (contentType?.includes("m4a")) return "m4a";
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  const fromUrl = url.split("?")[0]?.split(".").pop()?.toLowerCase();
  if (
    fromUrl &&
    ["mp4", "webm", "mp3", "m4a", "jpg", "jpeg", "png", "webp", "gif"].includes(fromUrl)
  ) {
    return fromUrl === "jpeg" ? "jpg" : fromUrl;
  }
  return "mp4";
}

export function metaContent(html: string, property: string): string | null {
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i"
  );
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
}

export function kindFromExt(ext: string, format?: FormatPreset): MediaKind {
  if (format === "audio-only" || ["mp3", "m4a", "opus", "ogg", "wav"].includes(ext)) return "audio";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  return "video";
}

export function toResolved(
  provider: ProviderId,
  sourceUrl: string,
  buffer: Buffer,
  ext: string,
  title?: string,
  format?: FormatPreset
): ResolvedMedia {
  return {
    kind: kindFromExt(ext, format),
    buffer,
    ext,
    sourceUrl,
    title,
    provider,
  };
}

import type { FormatPreset, MediaKind, ProviderId, ResolvedMedia } from "@pinforge/types";
import { EXTRACTOR_HEADERS } from "./headers";

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

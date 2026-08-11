import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { downloadToBuffer } from "@pinforge/download";
import { remuxHlsToMp4, resolveFfmpeg } from "../../../media/mux";
import { sanitizeMediaUrl } from "../shared/pinimg";
import { PINTEREST_USER_AGENT, pinterestRequestHeaders } from "../shared/session";

function extFromContentType(ct: string | null, url: string): string {
  if (ct?.includes("mp4") || ct?.includes("video")) return "mp4";
  if (ct?.includes("webm")) return "webm";
  if (ct?.includes("png")) return "png";
  if (ct?.includes("webp")) return "webp";
  if (ct?.includes("gif")) return "gif";
  if (ct?.includes("jpeg") || ct?.includes("jpg")) return "jpg";
  const fromUrl = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (fromUrl && ["jpg", "jpeg", "png", "webp", "gif", "mp4", "webm", "m3u8"].includes(fromUrl)) {
    return fromUrl === "jpeg" ? "jpg" : fromUrl === "m3u8" ? "mp4" : fromUrl;
  }
  return "jpg";
}

export async function downloadBinary(
  mediaUrl: string,
  accept: string
): Promise<{ buffer: Buffer; ext: string }> {
  const { buffer, contentType } = await downloadToBuffer(mediaUrl, {
    accept,
    referer: "https://www.pinterest.com/",
    concurrency: 4,
    headers: pinterestRequestHeaders(),
  });
  return { buffer, ext: extFromContentType(contentType, mediaUrl) };
}

export async function downloadHlsAsMp4(m3u8Url: string): Promise<{ buffer: Buffer; ext: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pinforge-hls-"));
  const outPath = path.join(tmpDir, "video.mp4");
  const jobId = `hls_${Date.now().toString(36)}`;
  try {
    try {
      const { downloadHlsResumable } = await import("@pinforge/download/hls");
      await downloadHlsResumable(m3u8Url, {
        jobId,
        jobDir: tmpDir,
        outPath,
        referer: "https://www.pinterest.com/",
        headers: pinterestRequestHeaders(),
        provider: "pinterest",
      });
    } catch {
      await remuxHlsToMp4(m3u8Url, outPath, {
        referer: "https://www.pinterest.com/",
        userAgent: PINTEREST_USER_AGENT,
      });
    }
    const buffer = await fs.readFile(outPath);
    return { buffer, ext: "mp4" };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function urlExists(u: string): Promise<boolean> {
  try {
    const res = await fetch(u, {
      method: "GET",
      headers: {
        ...pinterestRequestHeaders(),
        Referer: "https://www.pinterest.com/",
        Range: "bytes=0-0",
      },
      redirect: "follow",
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

export async function resolveBestImageUrl(preferred: string, fallbacks: string[]): Promise<string> {
  const tried = new Set<string>();
  for (const raw of [preferred, ...fallbacks].filter(Boolean)) {
    const u = sanitizeMediaUrl(raw);
    if (!u || tried.has(u)) continue;
    tried.add(u);
    if (await urlExists(u)) return u;
  }
  return sanitizeMediaUrl(preferred);
}

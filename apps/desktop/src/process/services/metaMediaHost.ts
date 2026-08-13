import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getStore } from "../store";

const TOKEN_TTL_MS = 30 * 60 * 1000;
const TUNNEL_READY_TIMEOUT_MS = 20_000;
const TUNNEL_POLL_MS = 400;
const VERIFY_TIMEOUT_MS = 15_000;

type MediaToken = {
  filePath: string;
  expiresAt: number;
};

const mediaTokens = new Map<string, MediaToken>();

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function readTunnelPublicBase(): Promise<string | null> {
  const remote = getStore().get("remote");
  const hostname = remote.tunnel.hostname?.trim();
  if (hostname) return normalizeBaseUrl(`https://${hostname}`);
  if (remote.tunnel.publicUrl?.trim()) return normalizeBaseUrl(remote.tunnel.publicUrl);

  const { getRemoteRuntimeStatus } = await import("./remoteRuntime");
  const runtime = getRemoteRuntimeStatus();
  if (runtime.tunnel.publicUrl?.trim()) {
    return normalizeBaseUrl(runtime.tunnel.publicUrl);
  }
  return null;
}

export function registerMetaMediaFile(filePath: string): string {
  const token = randomBytes(24).toString("hex");
  mediaTokens.set(token, { filePath, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

export function revokeMetaMediaToken(token: string): void {
  mediaTokens.delete(token);
}

function resolveMediaToken(token: string): string | null {
  const entry = mediaTokens.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    mediaTokens.delete(token);
    return null;
  }
  return entry.filePath;
}

function contentTypeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Ensure Cloudflare tunnel + local API are ready for Meta file_url uploads. */
export async function ensureMetaUploadTunnel(): Promise<string> {
  const remote = getStore().get("remote");
  if (!remote.tunnel.enabled) {
    throw new Error(
      "Enable Cloudflare Tunnel in Settings → Remote before uploading media to Facebook."
    );
  }

  const { syncRemoteRuntime, getRemoteRuntimeStatus } = await import("./remoteRuntime");
  await syncRemoteRuntime();

  const deadline = Date.now() + TUNNEL_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = getRemoteRuntimeStatus();
    const base = await readTunnelPublicBase();
    if (status.api.running && base) return base;
    await sleep(TUNNEL_POLL_MS);
  }

  const status = getRemoteRuntimeStatus();
  if (!status.api.running) {
    throw new Error(
      "Remote API is not running. Check Settings → Remote (tunnel port and cloudflared)."
    );
  }
  throw new Error(
    "Cloudflare Tunnel public URL is not ready yet. Wait for tunnel status “running” in Settings → Remote."
  );
}

/** Public HTTPS URL Meta can fetch for a local file (via Cloudflare Tunnel). */
export async function createMetaMediaPublicUrl(filePath: string): Promise<{
  url: string;
  token: string;
}> {
  const base = await ensureMetaUploadTunnel();
  const token = registerMetaMediaFile(filePath);
  return { url: `${base}/api/meta/media/${token}`, token };
}

/** Preflight check before handing URL to Meta Graph API. */
export async function verifyHostedMediaUrl(publicUrl: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(publicUrl, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: controller.signal,
    });
    if (res.status !== 200 && res.status !== 206) {
      throw new Error(`Hosted media URL returned ${res.status}.`);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Tunnel media URL is not reachable (${detail}).`);
  } finally {
    clearTimeout(timer);
  }
}

export async function serveMetaMediaRequest(
  token: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const filePath = resolveMediaToken(token);
  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const contentType = contentTypeForPath(filePath);
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
      if (match) {
        const size = info.size;
        const start = match[1] ? Number.parseInt(match[1], 10) : 0;
        const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
        if (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          start >= 0 &&
          end >= start &&
          start < size
        ) {
          const chunkEnd = Math.min(end, size - 1);
          const chunkSize = chunkEnd - start + 1;
          res.writeHead(206, {
            "Content-Type": contentType,
            "Content-Length": chunkSize,
            "Content-Range": `bytes ${start}-${chunkEnd}/${size}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
          });
          createReadStream(filePath, { start, end: chunkEnd }).pipe(res);
          return;
        }
      }
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": info.size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Failed to read media");
  }
}

/** No-op hook reserved for request logging / auth later. */
export function acceptMetaMediaRequest(_req: IncomingMessage): boolean {
  return true;
}

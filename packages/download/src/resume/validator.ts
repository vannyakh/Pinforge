import type {
  CheckpointValidationInput,
  CheckpointValidationResult,
  DownloadCheckpoint,
} from "../checkpoint";

/**
 * Validate that a resource still matches the checkpoint before resume.
 * Mismatch → caller must delete/restart rather than append.
 */
export function validateCheckpoint(
  checkpoint: DownloadCheckpoint,
  live: CheckpointValidationInput
): CheckpointValidationResult {
  if (live.url && checkpoint.url && normalizeUrl(live.url) !== normalizeUrl(checkpoint.url)) {
    // Allow CDN query-string drift when path matches for HTTP range jobs
    if (checkpoint.type === "http") {
      const a = stripQuery(checkpoint.url);
      const b = stripQuery(live.url);
      if (a !== b) {
        return { ok: false, reason: "URL path changed since checkpoint" };
      }
    } else if (normalizeUrl(live.url) !== normalizeUrl(checkpoint.url)) {
      return { ok: false, reason: "URL changed since checkpoint" };
    }
  }

  if (checkpoint.formatId && live.formatId && checkpoint.formatId !== live.formatId) {
    return { ok: false, reason: "Format ID changed since checkpoint" };
  }

  if (checkpoint.etag && live.etag && checkpoint.etag !== live.etag) {
    return { ok: false, reason: "ETag mismatch — remote file changed" };
  }

  if (
    checkpoint.lastModified &&
    live.lastModified &&
    checkpoint.lastModified !== live.lastModified
  ) {
    return { ok: false, reason: "Last-Modified mismatch — remote file changed" };
  }

  if (
    checkpoint.contentLength != null &&
    live.contentLength != null &&
    checkpoint.contentLength !== live.contentLength
  ) {
    return { ok: false, reason: "Content-Length mismatch — remote file changed" };
  }

  if (
    checkpoint.totalBytes != null &&
    live.contentLength != null &&
    checkpoint.totalBytes !== live.contentLength
  ) {
    return { ok: false, reason: "Total size mismatch — remote file changed" };
  }

  return { ok: true };
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

function stripQuery(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url.split("?")[0] ?? url;
  }
}

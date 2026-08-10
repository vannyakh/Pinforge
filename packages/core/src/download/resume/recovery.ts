import type { DownloadCheckpoint } from "../../jobs/checkpoint";
import { FilesystemStorage } from "../../storage/filesystem";
import { CheckpointStore } from "./checkpoint-store";
import { validateCheckpoint } from "./validator";

const storage = new FilesystemStorage();

export interface RecoveryResult {
  action: "resume" | "restart" | "skip";
  reason?: string;
  checkpoint?: DownloadCheckpoint;
}

/**
 * Decide whether an unfinished download can resume safely.
 */
export async function recoverCheckpoint(
  jobDir: string,
  live: {
    url: string;
    etag?: string | null;
    lastModified?: string | null;
    contentLength?: number | null;
    formatId?: string;
  }
): Promise<RecoveryResult> {
  const store = new CheckpointStore(jobDir);
  const cp = await store.load();
  if (!cp) {
    return { action: "restart", reason: "No checkpoint" };
  }

  const validation = validateCheckpoint(cp, live);
  if (!validation.ok) {
    await wipePartial(cp);
    await store.clear();
    return { action: "restart", reason: validation.reason, checkpoint: cp };
  }

  if (cp.type === "http" && cp.partPath) {
    const size = await storage.getSize(cp.partPath);
    if (size <= 0 && (cp.downloadedBytes ?? 0) <= 0) {
      return { action: "restart", reason: "Empty partial file", checkpoint: cp };
    }
  }

  if (cp.type === "hls" || cp.type === "dash") {
    const pending = (cp.segments ?? []).filter((s) => !s.downloaded);
    if (pending.length === 0 && (cp.segments?.length ?? 0) > 0) {
      return { action: "skip", reason: "All segments already downloaded", checkpoint: cp };
    }
  }

  return { action: "resume", checkpoint: cp };
}

async function wipePartial(cp: DownloadCheckpoint): Promise<void> {
  if (cp.partPath) await storage.remove(cp.partPath);
  if (cp.finalPath) {
    /* keep final if present */
  }
  for (const seg of cp.segments ?? []) {
    if (seg.path) await storage.remove(seg.path);
  }
}

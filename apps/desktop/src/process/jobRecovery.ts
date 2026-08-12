import { jobStatusToPackStatus } from "@pinforge/core/engine";
import type { DownloadJob } from "@pinforge/core/jobs";
import { getStore, type DownloadPack } from "./store";

function upsertPack(pack: DownloadPack): void {
  const store = getStore();
  const packs = store.get("packs").filter((p) => p.id !== pack.id);
  store.set("packs", [pack, ...packs].slice(0, 50));
}

/** Mirror recovered MediaCore jobs onto download packs for Tasks resume UI. */
export function syncRecoveredJobsToPacks(recovered: DownloadJob[]): void {
  const store = getStore();
  const packs = store.get("packs");
  for (const job of recovered) {
    if (!job.packId) continue;
    const pack = packs.find((p) => p.id === job.packId);
    if (!pack) continue;
    upsertPack({
      ...pack,
      status: jobStatusToPackStatus(job.status),
      jobId: job.id,
      updatedAt: Date.now(),
    });
  }
}

/**
 * Job recovery via pinforge-server (Rust). No Node MediaCore.
 */

import type { DownloadJob } from "./jobTypes";
import { jobStatusToPackStatus } from "./jobTypes";
import { getStore, type DownloadPack } from "./store";
import { requireServer, serverRequest } from "./pinforgeServer";

function upsertPack(pack: DownloadPack): void {
  const store = getStore();
  const packs = store.get("packs").filter((p) => p.id !== pack.id);
  store.set("packs", [pack, ...packs].slice(0, 50));
}

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

export async function recoverJobsOnStartup(): Promise<DownloadJob[]> {
  await requireServer();
  const recovered = await serverRequest<DownloadJob[]>("jobs.recover");
  syncRecoveredJobsToPacks(recovered ?? []);
  return recovered ?? [];
}

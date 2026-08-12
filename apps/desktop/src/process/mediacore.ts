/**
 * Desktop MediaCore bootstrap — persists jobs under userData/mediacore.
 */

import { app } from "electron";
import { join } from "node:path";
import { configureMediaCore, getMediaCore, type MediaCore } from "@pinforge/core/engine";
import type { DownloadJob } from "@pinforge/core/jobs";
import { syncRecoveredJobsToPacks } from "./jobRecovery";

let configured = false;

export function ensureMediaCore(): MediaCore {
  if (!configured) {
    configureMediaCore({
      dataDir: join(app.getPath("userData"), "mediacore"),
    });
    configured = true;
  }
  return getMediaCore();
}

export async function recoverJobsOnStartup(): Promise<DownloadJob[]> {
  const core = ensureMediaCore();
  await core.init();
  const recovered = await core.recover();
  syncRecoveredJobsToPacks(recovered);
  return recovered;
}

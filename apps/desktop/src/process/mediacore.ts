/**
 * Desktop MediaCore bootstrap — persists jobs under userData/mediacore.
 */

import { app } from "electron";
import { join } from "node:path";
import {
  configureMediaCore,
  getMediaCore,
  type MediaCore,
  type DownloadJob,
} from "@pinterest-desktop/core";

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
  return core.recover();
}

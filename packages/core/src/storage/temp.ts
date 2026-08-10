import path from "node:path";
import os from "node:os";
import { FilesystemStorage, jobWorkDir } from "./filesystem";

const storage = new FilesystemStorage();

/** Resolve a writable temp/work root for MediaCore jobs. */
export function defaultMediaCoreRoot(override?: string): string {
  if (override) return override;
  if (process.env.PINFORGE_MEDIACORE_DIR) return process.env.PINFORGE_MEDIACORE_DIR;
  return path.join(os.homedir(), ".pinforge", "mediacore");
}

export async function ensureJobTempDir(root: string, jobId: string): Promise<string> {
  const dir = jobWorkDir(root, jobId);
  await storage.ensureDir(dir);
  await storage.ensureDir(path.join(dir, "segments"));
  return dir;
}

export { storage as tempStorage };

import fs from "node:fs/promises";
import path from "node:path";

/** Minimal disk helpers for download checkpoints (keeps download free of engine/storage). */
export function checkpointPathFor(jobDir: string): string {
  return path.join(jobDir, "checkpoint.json");
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

export async function removeFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true }).catch(() => undefined);
}

export async function fileSize(filePath: string): Promise<number> {
  try {
    const st = await fs.stat(filePath);
    return st.size;
  } catch {
    return 0;
  }
}

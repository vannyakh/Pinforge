import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif"]);

export type LocalMediaEntry = {
  filePath: string;
  name: string;
  mtimeMs: number;
};

export async function listLocalMediaInFolder(
  dirPath: string,
  kind: "video" | "photo",
  limit = 100
): Promise<LocalMediaEntry[]> {
  const trimmed = dirPath.trim();
  if (!trimmed) return [];

  const extOk = kind === "video" ? VIDEO_EXT : IMAGE_EXT;
  const dirStat = await stat(trimmed);
  if (!dirStat.isDirectory()) {
    throw new Error("Path is not a folder.");
  }

  const entries = await readdir(trimmed, { withFileTypes: true });
  const items: LocalMediaEntry[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!extOk.has(ext)) continue;
    const filePath = join(trimmed, entry.name);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) continue;
    items.push({
      filePath,
      name: basename(filePath),
      mtimeMs: fileStat.mtimeMs,
    });
  }

  return items.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}

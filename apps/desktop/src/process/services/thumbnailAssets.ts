import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { app } from "electron";

export function resolveThumbnailPath(fileName: string): string | null {
  const safe = basename(fileName.trim());
  if (!safe || safe !== fileName.trim() || safe.includes("..")) return null;

  const candidates = [
    join(__dirname, "../../resources/thumbnails", safe),
    join(process.cwd(), "resources/thumbnails", safe),
    join(app.getAppPath(), "resources/thumbnails", safe),
    join(process.resourcesPath, "thumbnails", safe),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

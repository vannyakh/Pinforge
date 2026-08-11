import fs from "node:fs/promises";
import path from "node:path";

export interface ResumeState {
  url: string;
  destPath: string;
  total: number | null;
  completedRanges: Array<{ start: number; end: number }>;
  updatedAt: number;
}

export function resumeStatePath(destPath: string): string {
  return `${destPath}.part.json`;
}

export async function loadResumeState(destPath: string): Promise<ResumeState | null> {
  try {
    const raw = await fs.readFile(resumeStatePath(destPath), "utf8");
    return JSON.parse(raw) as ResumeState;
  } catch {
    return null;
  }
}

export async function saveResumeState(state: ResumeState): Promise<void> {
  await fs.mkdir(path.dirname(state.destPath), { recursive: true });
  await fs.writeFile(resumeStatePath(state.destPath), JSON.stringify(state), "utf8");
}

export async function clearResumeState(destPath: string): Promise<void> {
  await fs.unlink(resumeStatePath(destPath)).catch(() => undefined);
}

export function rangesOverlap(
  a: { start: number; end: number },
  completed: Array<{ start: number; end: number }>
): boolean {
  return completed.some((c) => a.start >= c.start && a.end <= c.end);
}

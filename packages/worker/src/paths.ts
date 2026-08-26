/**
 * Binary path resolution for pinforge-server / pinforge-worker.
 * Kept pure for unit tests (no spawn).
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function electronResourcesPath(): string | undefined {
  const p = process as NodeJS.Process & { resourcesPath?: string };
  return typeof p.resourcesPath === "string" ? p.resourcesPath : undefined;
}

export function repoRustReleaseDir(fromModuleUrl: string = import.meta.url): string {
  const here = dirname(fileURLToPath(fromModuleUrl));
  // packages/worker/src → repo rust/target/release
  return join(here, "..", "..", "..", "..", "rust", "target", "release");
}

export function repoRustDebugDir(fromModuleUrl: string = import.meta.url): string {
  const here = dirname(fileURLToPath(fromModuleUrl));
  return join(here, "..", "..", "..", "..", "rust", "target", "debug");
}

export function candidateServerBinaries(opts?: {
  envPath?: string | null;
  platform?: NodeJS.Platform;
  resourcesPath?: string | null;
  fromModuleUrl?: string;
}): string[] {
  const platform = opts?.platform ?? process.platform;
  const exe = platform === "win32" ? "pinforge-server.exe" : "pinforge-server";
  const env = (opts?.envPath ?? process.env.PINFORGE_SERVER)?.trim();
  const from = opts?.fromModuleUrl ?? import.meta.url;
  const resources: string[] = [];
  const res = opts?.resourcesPath === undefined ? electronResourcesPath() : opts.resourcesPath;
  if (res) {
    resources.push(join(res, "bin", exe));
    resources.push(join(res, exe));
  }
  const list = [
    env,
    ...resources,
    join(repoRustReleaseDir(from), exe),
    join(repoRustDebugDir(from), exe),
  ].filter(Boolean) as string[];
  return [...new Set(list)];
}

export function candidateWorkerBinaries(opts?: {
  envPath?: string | null;
  platform?: NodeJS.Platform;
  resourcesPath?: string | null;
  fromModuleUrl?: string;
}): string[] {
  const platform = opts?.platform ?? process.platform;
  const exe = platform === "win32" ? "pinforge-worker.exe" : "pinforge-worker";
  const env = (opts?.envPath ?? process.env.PINFORGE_WORKER)?.trim();
  const from = opts?.fromModuleUrl ?? import.meta.url;
  const resources: string[] = [];
  const res = opts?.resourcesPath === undefined ? electronResourcesPath() : opts.resourcesPath;
  if (res) {
    resources.push(join(res, "bin", exe));
    resources.push(join(res, exe));
  }
  const list = [
    env,
    ...resources,
    join(repoRustReleaseDir(from), exe),
    join(repoRustDebugDir(from), exe),
  ].filter(Boolean) as string[];
  return [...new Set(list)];
}

/** Parse one-shot worker CLI JSON line (`{ ok, data }` or error). */
export function parseWorkerJsonLine<T>(stdout: string): T {
  const line = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (!line) throw new Error("empty worker response");
  const parsed = JSON.parse(line) as { ok?: boolean; data?: T; error?: string };
  if (parsed.ok === false) throw new Error(parsed.error || "worker failed");
  if (parsed.data === undefined) throw new Error("worker response missing data");
  return parsed.data;
}

/** Parse server NDJSON response line (`{ id, ok, result|error }`). */
export function parseServerResponseLine(line: string): {
  kind: "event" | "result" | "error";
  event?: string;
  payload?: unknown;
  id?: string;
  result?: unknown;
  error?: string;
} {
  const msg = JSON.parse(line) as Record<string, unknown>;
  if (typeof msg.event === "string") {
    return { kind: "event", event: msg.event, payload: msg.payload };
  }
  const id = msg.id != null ? String(msg.id) : undefined;
  if (msg.ok === false) {
    return { kind: "error", id, error: String(msg.error ?? "server error") };
  }
  return { kind: "result", id, result: msg.result };
}

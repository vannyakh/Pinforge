import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { writeFile, readFile, unlink } from "node:fs/promises";
import type { PresetName } from "../types";

export interface RustEnhanceResult {
  buffer: Buffer;
  ext: string;
  via: "rust";
  width?: number;
  height?: number;
}

export interface RustDownloadResult {
  path: string;
  bytes: number;
  usedFragments: boolean;
  via: "rust";
}

function candidateBinaries(): string[] {
  const env = process.env.PINFORGE_WORKER?.trim();
  const exe = process.platform === "win32" ? "pinforge-worker.exe" : "pinforge-worker";
  const here = dirname(fileURLToPath(import.meta.url));
  // packages/core/src/worker → repo rust/target/...
  const repoRust = join(here, "..", "..", "..", "..", "rust", "target", "release", exe);
  const repoRustDebug = join(here, "..", "..", "..", "..", "rust", "target", "debug", exe);
  const list = [env, repoRust, repoRustDebug].filter(Boolean) as string[];
  return [...new Set(list)];
}

let cachedBin: string | null | undefined;

export async function resolveWorkerBinary(): Promise<string | null> {
  if (cachedBin !== undefined) return cachedBin;
  for (const p of candidateBinaries()) {
    try {
      await access(p, constants.X_OK).catch(async () => access(p, constants.F_OK));
      cachedBin = p;
      return p;
    } catch {
      /* try next */
    }
  }
  cachedBin = null;
  return null;
}

export function resetWorkerBinaryCache(): void {
  cachedBin = undefined;
}

function runWorker(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `pinforge-worker exited ${code}`));
    });
  });
}

function parseJsonLine<T>(stdout: string): T {
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

export async function rustPing(): Promise<boolean> {
  const bin = await resolveWorkerBinary();
  if (!bin) return false;
  try {
    const { stdout } = await runWorker(bin, ["ping"]);
    const data = parseJsonLine<{ enhance?: string }>(stdout);
    return Boolean(data.enhance);
  } catch {
    return false;
  }
}

/** Enhance via Rust worker when binary is available. */
export async function rustEnhance(
  buffer: Buffer,
  preset: PresetName
): Promise<RustEnhanceResult | null> {
  const bin = await resolveWorkerBinary();
  if (!bin) return null;

  const id = randomBytes(8).toString("hex");
  const input = join(tmpdir(), `pinforge-in-${id}.img`);
  const output = join(tmpdir(), `pinforge-out-${id}.png`);
  try {
    await writeFile(input, buffer);
    const { stdout } = await runWorker(bin, [
      "enhance",
      "--preset",
      preset,
      "--input",
      input,
      "--output",
      output,
    ]);
    const meta = parseJsonLine<{ ext?: string; width?: number; height?: number }>(stdout);
    const outBuf = await readFile(output);
    return {
      buffer: outBuf,
      ext: meta.ext || "png",
      via: "rust",
      width: meta.width,
      height: meta.height,
    };
  } finally {
    await unlink(input).catch(() => undefined);
    await unlink(output).catch(() => undefined);
  }
}

/** Fragment download via Rust worker when binary is available. */
export async function rustDownload(opts: {
  url: string;
  outPath: string;
  concurrency?: number;
  referer?: string;
}): Promise<RustDownloadResult | null> {
  const bin = await resolveWorkerBinary();
  if (!bin) return null;
  const args = [
    "download",
    "--url",
    opts.url,
    "--out",
    opts.outPath,
    "--concurrency",
    String(opts.concurrency ?? 4),
  ];
  if (opts.referer) args.push("--referer", opts.referer);
  const { stdout } = await runWorker(bin, args);
  const data = parseJsonLine<{ path: string; bytes: number; used_fragments?: boolean }>(stdout);
  return {
    path: data.path,
    bytes: data.bytes,
    usedFragments: Boolean(data.used_fragments),
    via: "rust",
  };
}

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FormatPreset, ResolvedMedia, YoutubeQuality } from "@pinforge/types";
import { sanitizeFilename } from "@pinforge/types";
import { resolveFfmpeg } from "../../media/mux";
import { buildYtdlpDownloadArgs, buildYtdlpProbeArgs } from "./args";
import { isHttpUrl } from "@pinforge/common";
import { requireYtdlpMessage, resolveYtdlp } from "@pinforge/tools";

export type YtdlpResolveOpts = {
  format?: FormatPreset;
  quality?: YoutubeQuality;
  outDir?: string;
  signal?: AbortSignal;
  onByteProgress?: (info: { downloaded: number; total: number | null; phase?: string }) => void;
};

export type YtdlpPreview = {
  id?: string;
  title: string;
  channel?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  ext?: string;
};

function runYtdlp(
  bin: string,
  args: string[],
  opts?: { signal?: AbortSignal; onStderrLine?: (line: string) => void }
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const onAbort = () => {
      child.kill("SIGTERM");
    };
    opts?.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) opts?.onStderrLine?.(line.trim());
      }
    });
    child.on("error", (err) => {
      opts?.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      opts?.signal?.removeEventListener("abort", onAbort);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

function parseProgressLine(line: string): { downloaded: number; total: number | null } | null {
  // [download]  45.2% of 12.34MiB at ...
  const m = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+)(KiB|MiB|GiB|B)/i);
  if (!m) return null;
  const pct = Number(m[1]);
  const size = Number(m[2]);
  const unit = m[3].toLowerCase();
  const mult = unit === "gib" ? 1024 ** 3 : unit === "mib" ? 1024 ** 2 : unit === "kib" ? 1024 : 1;
  const total = size * mult;
  if (!Number.isFinite(pct) || !Number.isFinite(total) || total <= 0) return null;
  return { downloaded: Math.round((pct / 100) * total), total: Math.round(total) };
}

function pickOutputPath(stdout: string, workDir: string): string | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (/^[A-Za-z]:\\|^\/|^\.\\|^\.\.\//.test(line) || line.includes(path.sep)) {
      return line;
    }
  }
  return null;
}

async function findNewestMedia(dir: string): Promise<string | null> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  let best: { path: string; mtime: number } | null = null;
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (/\.(part|ytdl|temp)$/i.test(e.name)) continue;
    if (!/\.(mp4|webm|mkv|m4a|mp3|opus|flac|mov|avi)$/i.test(e.name)) continue;
    const full = path.join(dir, e.name);
    const st = await fs.stat(full).catch(() => null);
    if (!st) continue;
    if (!best || st.mtimeMs > best.mtime) best = { path: full, mtime: st.mtimeMs };
  }
  return best?.path ?? null;
}

export async function previewYtdlp(url: string): Promise<YtdlpPreview> {
  if (!isHttpUrl(url)) throw new Error("yt-dlp requires an http(s) URL");
  const bin = await resolveYtdlp();
  if (!bin) throw new Error(requireYtdlpMessage());
  const { stdout, stderr, code } = await runYtdlp(bin, buildYtdlpProbeArgs(url));
  if (code !== 0) {
    throw new Error(stderr.trim().split(/\r?\n/).slice(-3).join(" ") || `yt-dlp exited ${code}`);
  }
  const data = JSON.parse(stdout) as {
    id?: string;
    title?: string;
    uploader?: string;
    channel?: string;
    thumbnail?: string;
    thumbnails?: Array<{ url?: string }>;
    duration?: number;
    ext?: string;
  };
  const thumb =
    data.thumbnail ||
    (Array.isArray(data.thumbnails) ? data.thumbnails[data.thumbnails.length - 1]?.url : undefined);
  return {
    id: data.id,
    title: data.title || data.id || "download",
    channel: data.channel || data.uploader,
    thumbnailUrl: thumb,
    durationSec: typeof data.duration === "number" ? data.duration : undefined,
    ext: data.ext,
  };
}

export async function resolveYtdlpMedia(
  url: string,
  opts: YtdlpResolveOpts = {}
): Promise<ResolvedMedia> {
  if (!isHttpUrl(url)) throw new Error("yt-dlp requires an http(s) URL");
  const bin = await resolveYtdlp();
  if (!bin) throw new Error(requireYtdlpMessage());

  const format = opts.format ?? "best";
  const ff = await resolveFfmpeg();
  const workRoot = opts.outDir ?? path.join(os.tmpdir(), "pinforge-ytdlp", String(Date.now()));
  await fs.mkdir(workRoot, { recursive: true });

  const outTemplate = path.join(workRoot, "%(title).180B [%(id)s].%(ext)s");
  opts.onByteProgress?.({ downloaded: 0, total: null, phase: "meta" });

  const args = buildYtdlpDownloadArgs({
    url,
    outTemplate,
    format,
    quality: opts.quality,
    ffmpegPath: ff,
  });

  const { stdout, stderr, code } = await runYtdlp(bin, args, {
    signal: opts.signal,
    onStderrLine: (line) => {
      const prog = parseProgressLine(line);
      if (prog) opts.onByteProgress?.({ ...prog, phase: "download" });
      if (/\[Merger\]|\[ExtractAudio\]|\[ffmpeg\]/i.test(line)) {
        opts.onByteProgress?.({ downloaded: 0, total: null, phase: "mux" });
      }
    },
  });

  if (code !== 0) {
    const tip = stderr.trim().split(/\r?\n/).slice(-4).join(" ");
    throw new Error(tip || `yt-dlp failed (exit ${code})`);
  }

  let filePath = pickOutputPath(stdout, workRoot);
  if (
    !filePath ||
    !(await fs
      .stat(filePath)
      .then(() => true)
      .catch(() => false))
  ) {
    filePath = await findNewestMedia(workRoot);
  }
  if (!filePath) {
    throw new Error("yt-dlp finished but no output file was found");
  }

  const ext =
    path.extname(filePath).replace(/^\./, "") || (format === "audio-only" ? "m4a" : "mp4");
  const base = path.basename(filePath, path.extname(filePath));
  const title = sanitizeFilename(base) || "download";
  const kind =
    format === "audio-only" || /^(m4a|mp3|opus|flac|ogg)$/i.test(ext) ? "audio" : "video";

  opts.onByteProgress?.({
    downloaded: 1,
    total: 1,
    phase: "done",
  });

  if (!opts.outDir) {
    const buffer = await fs.readFile(filePath);
    await fs.rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
    return {
      kind,
      buffer,
      ext,
      sourceUrl: url,
      title,
      provider: "ytdlp",
    };
  }

  // If yt-dlp wrote into outDir already, keep it; otherwise move from workRoot.
  let finalPath = filePath;
  if (path.resolve(path.dirname(filePath)) !== path.resolve(opts.outDir)) {
    await fs.mkdir(opts.outDir, { recursive: true });
    finalPath = path.join(opts.outDir, path.basename(filePath));
    await fs.copyFile(filePath, finalPath);
    await fs.rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  return {
    kind,
    filePath: finalPath,
    ext,
    sourceUrl: url,
    title,
    provider: "ytdlp",
  };
}

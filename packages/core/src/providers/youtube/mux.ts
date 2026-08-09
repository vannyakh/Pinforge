import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

let ffmpegPathCache: string | null | undefined;
let configuredPath: string | undefined;
let configuredEnabled = true;

/** Desktop main calls this so System settings control mux/convert/tag. */
export function configureFfmpeg(opts: { path?: string; enabled?: boolean }): void {
  configuredPath = opts.path?.trim() || undefined;
  if (opts.enabled !== undefined) configuredEnabled = opts.enabled;
  ffmpegPathCache = undefined;
}

export function clearFfmpegCache(): void {
  ffmpegPathCache = undefined;
}

export async function resolveFfmpeg(): Promise<string | null> {
  if (!configuredEnabled) return null;
  if (ffmpegPathCache !== undefined) return ffmpegPathCache;

  const candidates = [
    configuredPath,
    process.platform === "win32" ? "ffmpeg.exe" : undefined,
    "ffmpeg",
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    try {
      if (path.isAbsolute(bin)) await fs.access(bin);
      await runFfmpeg(bin, ["-version"]);
      ffmpegPathCache = bin;
      return bin;
    } catch {
      /* try next */
    }
  }
  ffmpegPathCache = null;
  return null;
}

export function requireFfmpegMessage(): string {
  return "ffmpeg is not available. Install it in Settings → System, then enable ffmpeg tools.";
}

async function runFfmpeg(bin: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim().split("\n").slice(-4).join(" ") || `ffmpeg exited ${code}`));
    });
  });
}

export async function muxAv(
  videoPath: string,
  audioPath: string,
  outPath: string
): Promise<void> {
  const bin = await resolveFfmpeg();
  if (!bin) throw new Error(requireFfmpegMessage());
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await runFfmpeg(bin, [
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-c",
    "copy",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0?",
    "-shortest",
    outPath,
  ]);
}

export async function convertAudio(
  inputPath: string,
  outPath: string,
  container: "m4a" | "mp3" | "flac"
): Promise<void> {
  const bin = await resolveFfmpeg();
  if (!bin) throw new Error(requireFfmpegMessage());
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const args = ["-y", "-i", inputPath];
  if (container === "m4a") {
    args.push("-c:a", "aac", "-b:a", "192k", outPath);
  } else if (container === "mp3") {
    args.push("-c:a", "libmp3lame", "-q:a", "2", outPath);
  } else {
    args.push("-c:a", "flac", outPath);
  }
  await runFfmpeg(bin, args);
}

export async function embedMetadata(opts: {
  inputPath: string;
  outPath: string;
  title?: string;
  artist?: string;
  description?: string;
  date?: string;
  thumbnailPath?: string;
  subtitlePath?: string;
}): Promise<void> {
  const bin = await resolveFfmpeg();
  if (!bin) throw new Error(requireFfmpegMessage());
  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });

  const args = ["-y", "-i", opts.inputPath];
  if (opts.thumbnailPath) args.push("-i", opts.thumbnailPath);
  if (opts.subtitlePath) args.push("-i", opts.subtitlePath);

  args.push("-map", "0");
  if (opts.thumbnailPath) {
    args.push("-map", "1", "-c", "copy", "-c:v:1", "mjpeg", "-disposition:v:1", "attached_pic");
  } else {
    args.push("-c", "copy");
  }
  if (opts.subtitlePath) {
    const subIdx = opts.thumbnailPath ? "2" : "1";
    args.push("-map", subIdx, "-c:s", "mov_text");
  }

  if (opts.title) args.push("-metadata", `title=${opts.title}`);
  if (opts.artist) args.push("-metadata", `artist=${opts.artist}`);
  if (opts.description) args.push("-metadata", `description=${opts.description.slice(0, 2000)}`);
  if (opts.date) args.push("-metadata", `date=${opts.date}`);
  args.push("-movflags", "use_metadata_tags", opts.outPath);

  await runFfmpeg(bin, args);
}

export async function remuxCopy(inputPath: string, outPath: string): Promise<void> {
  const bin = await resolveFfmpeg();
  if (!bin) {
    await fs.copyFile(inputPath, outPath);
    return;
  }
  await runFfmpeg(bin, ["-y", "-i", inputPath, "-c", "copy", outPath]);
}

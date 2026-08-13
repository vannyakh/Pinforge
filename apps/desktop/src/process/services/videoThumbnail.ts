import { access, mkdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { app } from "electron";
import { requireFfmpegMessage, resolveFfmpeg, runFfmpeg } from "@pinforge/core/tools";

const CANDIDATE_COUNT = 4;

function ffprobePath(ffmpegPath: string): string {
  if (ffmpegPath.endsWith("ffmpeg.exe")) {
    return ffmpegPath.replace(/ffmpeg\.exe$/i, "ffprobe.exe");
  }
  if (ffmpegPath.endsWith("ffmpeg")) {
    return ffmpegPath.replace(/ffmpeg$/, "ffprobe");
  }
  return "ffprobe";
}

async function probeVideoDurationSeconds(videoPath: string, ffmpegPath: string): Promise<number | undefined> {
  const probe = ffprobePath(ffmpegPath);
  return new Promise((resolve) => {
    const child = spawn(
      probe,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        videoPath,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("error", () => resolve(undefined));
    child.on("close", () => {
      const value = Number.parseFloat(out.trim());
      resolve(Number.isFinite(value) && value > 0 ? value : undefined);
    });
  });
}

function pickSeekSeconds(durationSec: number | undefined): number[] {
  if (!durationSec || durationSec <= 1.5) {
    return [0.5, 1, 1.5, 2].slice(0, CANDIDATE_COUNT);
  }
  const max = Math.max(1, durationSec - 0.25);
  const ratios = [0.1, 0.3, 0.5, 0.7];
  return ratios.map((ratio) => Math.min(max, Math.max(0.5, durationSec * ratio)));
}

async function ensureVideoThumbCacheDir(): Promise<string> {
  const dir = join(app.getPath("userData"), "publish-video-thumbs");
  await mkdir(dir, { recursive: true });
  return dir;
}

async function extractFrame(
  ffmpegPath: string,
  videoPath: string,
  seekSec: number,
  outputPath: string
): Promise<void> {
  await runFfmpeg(ffmpegPath, [
    "-ss",
    seekSec.toFixed(3),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    "-y",
    outputPath,
  ]);
}

/** Extract JPEG frame candidates from a local video (cached under userData). */
export async function generateVideoThumbnailCandidates(videoPath: string): Promise<string[]> {
  const trimmed = videoPath.trim();
  if (!trimmed) throw new Error("Video path is required.");

  const info = await stat(trimmed);
  if (!info.isFile()) throw new Error(`Not a file: ${basename(trimmed)}`);

  const ffmpegPath = await resolveFfmpeg();
  if (!ffmpegPath) throw new Error(requireFfmpegMessage());

  const hash = createHash("sha256")
    .update(`${trimmed}:${info.size}:${info.mtimeMs}`)
    .digest("hex")
    .slice(0, 20);
  const cacheDir = join(await ensureVideoThumbCacheDir(), hash);
  await mkdir(cacheDir, { recursive: true });

  const duration = await probeVideoDurationSeconds(trimmed, ffmpegPath);
  const seeks = pickSeekSeconds(duration);
  const outputs: string[] = [];

  for (let i = 0; i < seeks.length; i++) {
    const outPath = join(cacheDir, `frame-${i}.jpg`);
    try {
      await access(outPath);
      outputs.push(outPath);
      continue;
    } catch {
      /* generate */
    }
    await extractFrame(ffmpegPath, trimmed, seeks[i]!, outPath);
    outputs.push(outPath);
  }

  if (outputs.length === 0) {
    throw new Error("Could not generate thumbnails from this video.");
  }

  return outputs;
}

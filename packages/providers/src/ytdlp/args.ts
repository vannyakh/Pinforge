import type { FormatPreset, YoutubeQuality } from "@pinforge/types";

export type YtdlpFormatOpts = {
  format?: FormatPreset;
  quality?: YoutubeQuality;
  /** Absolute ffmpeg binary for yt-dlp --ffmpeg-location */
  ffmpegPath?: string | null;
};

function heightFilter(quality?: YoutubeQuality): string {
  if (!quality || quality === "best") return "";
  const n = Number(quality);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `[height<=${n}]`;
}

/** Build `-f` selector for yt-dlp. */
export function ytdlpFormatSelector(opts: YtdlpFormatOpts = {}): string {
  const format = opts.format ?? "best";
  const h = heightFilter(opts.quality);
  if (format === "audio-only") {
    return "ba/b";
  }
  // Prefer separate video+audio (DASH-like), then progressive.
  if (format === "mp4") {
    return `bv*${h}[ext=mp4]+ba[ext=m4a]/b${h}[ext=mp4]/bv*${h}+ba/b${h}`;
  }
  return `bv*${h}+ba/b${h}`;
}

export type YtdlpDownloadArgOpts = YtdlpFormatOpts & {
  url: string;
  outTemplate: string;
  /** Restrict to a single item (default true). */
  noPlaylist?: boolean;
};

/** Argv for a single-item download (no binary name). */
export function buildYtdlpDownloadArgs(opts: YtdlpDownloadArgOpts): string[] {
  const noPlaylist = opts.noPlaylist !== false;
  const args = [
    opts.url,
    "-f",
    ytdlpFormatSelector(opts),
    "-o",
    opts.outTemplate,
    "--no-mtime",
    "--newline",
    "--print",
    "after_move:filepath",
    "--print",
    "filepath",
  ];
  if (noPlaylist) args.push("--no-playlist");
  if (opts.format === "audio-only") {
    args.push("-x", "--audio-format", "m4a");
  } else if (opts.format === "mp4") {
    args.push("--merge-output-format", "mp4");
  }
  if (opts.ffmpegPath) {
    args.push("--ffmpeg-location", opts.ffmpegPath);
  }
  return args;
}

/** Argv for JSON metadata probe (no download). */
export function buildYtdlpProbeArgs(url: string, noPlaylist = true): string[] {
  const args = [url, "-J", "--skip-download", "--no-warnings"];
  if (noPlaylist) args.push("--no-playlist");
  return args;
}

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

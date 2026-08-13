/**
 * yt-dlp binary resolution for the catch-all provider and ToolRegistry.
 */

let configuredPath: string | undefined;
let configuredEnabled = true;
let ytdlpPathCache: string | null | undefined;

export function configureYtdlp(opts: { path?: string; enabled?: boolean }): void {
  configuredPath = opts.path?.trim() || undefined;
  if (opts.enabled !== undefined) configuredEnabled = opts.enabled;
  ytdlpPathCache = undefined;
}

export function clearYtdlpCache(): void {
  ytdlpPathCache = undefined;
}

export function requireYtdlpMessage(): string {
  return "yt-dlp is not available. Install or reinstall it in Settings → System, then enable yt-dlp tools.";
}

async function probe(bin: string): Promise<boolean> {
  const { spawn } = await import("node:child_process");
  return await new Promise((resolve) => {
    const child = spawn(bin, ["--version"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** Resolve yt-dlp binary (configured path, then PATH). */
export async function resolveYtdlp(): Promise<string | null> {
  if (!configuredEnabled) return null;
  if (ytdlpPathCache !== undefined) return ytdlpPathCache;

  const candidates = [
    configuredPath,
    process.platform === "win32" ? "yt-dlp.exe" : undefined,
    "yt-dlp",
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    try {
      if (await probe(bin)) {
        ytdlpPathCache = bin;
        return bin;
      }
    } catch {
      /* try next */
    }
  }
  ytdlpPathCache = null;
  return null;
}

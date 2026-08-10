/**
 * Playwright Chromium install / probe for Settings → Environment.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

export type PlaywrightStatus = {
  available: boolean;
  path: string;
  version?: string;
  installing: boolean;
};

export type PlaywrightInstallProgress = {
  phase: "download" | "done" | "error";
  percent: number;
  message: string;
};

let installing = false;

const requireFromMain = createRequire(__filename);

function resolvePlaywrightCli(): string {
  return requireFromMain.resolve("playwright/cli.js");
}

async function chromiumExecutablePath(): Promise<string | null> {
  try {
    const { chromium } = await import("playwright");
    const exe = chromium.executablePath();
    if (!exe) return null;
    await fs.access(exe);
    return exe;
  } catch {
    return null;
  }
}

export async function getPlaywrightStatus(): Promise<PlaywrightStatus> {
  const exe = await chromiumExecutablePath();
  if (!exe) {
    return { available: false, path: "", installing };
  }
  // Folder name includes revision, e.g. chromium_headless_shell-1234
  const revision = path.basename(path.dirname(path.dirname(exe)));
  return {
    available: true,
    path: exe,
    version: revision || "Chromium",
    installing,
  };
}

/**
 * Run `playwright install chromium` into Playwright’s default browsers directory.
 */
export async function installPlaywrightChromium(
  onProgress?: (ev: PlaywrightInstallProgress) => void
): Promise<PlaywrightStatus> {
  if (installing) throw new Error("Playwright install already in progress");
  installing = true;
  try {
    const cli = resolvePlaywrightCli();
    onProgress?.({
      phase: "download",
      percent: 5,
      message: "Downloading Playwright Chromium…",
    });

    await new Promise<void>((resolve, reject) => {
      // Electron’s execPath is not Node; run the CLI as Node via this flag.
      const child = spawn(process.execPath, [cli, "install", "chromium"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });

      let err = "";
      let lastPct = 5;
      const bump = (line: string) => {
        const m = line.match(/(\d+)\s*%/);
        if (m) {
          lastPct = Math.min(95, Math.max(lastPct, Number(m[1])));
          onProgress?.({
            phase: "download",
            percent: lastPct,
            message: line.trim().slice(0, 120) || "Downloading…",
          });
        } else if (/Downloading|downloaded|Removing/i.test(line)) {
          onProgress?.({
            phase: "download",
            percent: lastPct,
            message: line.trim().slice(0, 120),
          });
        }
      };

      child.stdout?.on("data", (d: Buffer) => {
        for (const line of d.toString().split(/\r?\n/)) if (line.trim()) bump(line);
      });
      child.stderr?.on("data", (d: Buffer) => {
        const text = d.toString();
        err += text;
        for (const line of text.split(/\r?\n/)) if (line.trim()) bump(line);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else {
          reject(
            new Error(
              err.trim().split(/\r?\n/).slice(-4).join(" ") || `playwright install exited ${code}`
            )
          );
        }
      });
    });

    const status = await getPlaywrightStatus();
    if (!status.available) {
      throw new Error("Playwright install finished but Chromium executable was not found.");
    }
    onProgress?.({ phase: "done", percent: 100, message: "Playwright Chromium installed" });
    return status;
  } catch (e) {
    onProgress?.({
      phase: "error",
      percent: 0,
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  } finally {
    installing = false;
  }
}

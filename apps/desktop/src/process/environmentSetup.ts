/**
 * First-run environment setup: install ffmpeg → yt-dlp → Playwright Chromium.
 */

import { getStore } from "./store";
import { getFfmpegStatus, installFfmpeg } from "./ffmpegInstall";
import { getYtdlpStatus, installYtdlp } from "./ytdlpInstall";
import { getPlaywrightStatus, installPlaywrightChromium } from "./playwrightInstall";

export type EnvironmentSetupStep = "ffmpeg" | "ytdlp" | "playwright";

export type EnvironmentToolSnapshot = {
  available: boolean;
  path?: string;
  version?: string;
};

export type EnvironmentSetupStatus = {
  needed: boolean;
  done: boolean;
  running: boolean;
  tools: {
    ffmpeg: EnvironmentToolSnapshot;
    ytdlp: EnvironmentToolSnapshot;
    playwright: EnvironmentToolSnapshot;
  };
};

export type EnvironmentSetupProgress = {
  step: EnvironmentSetupStep;
  stepIndex: number;
  stepCount: number;
  phase: "check" | "download" | "extract" | "done" | "error" | "skip";
  percent: number;
  message: string;
  toolAvailable?: boolean;
};

const STEPS: EnvironmentSetupStep[] = ["ffmpeg", "ytdlp", "playwright"];

let running = false;

async function toolSnapshots(): Promise<EnvironmentSetupStatus["tools"]> {
  const [ffmpeg, ytdlp, playwright] = await Promise.all([
    getFfmpegStatus(),
    getYtdlpStatus(),
    getPlaywrightStatus(),
  ]);
  return {
    ffmpeg: { available: ffmpeg.available, path: ffmpeg.path, version: ffmpeg.version },
    ytdlp: { available: ytdlp.available, path: ytdlp.path, version: ytdlp.version },
    playwright: {
      available: playwright.available,
      path: playwright.path,
      version: playwright.version,
    },
  };
}

export async function getEnvironmentSetupStatus(): Promise<EnvironmentSetupStatus> {
  const done = Boolean(getStore().get("system")?.environmentSetupDone);
  const tools = await toolSnapshots();
  return {
    needed: !done,
    done,
    running,
    tools,
  };
}

/** Complete setup (success or user skipped) and return fresh tool probes. */
export async function completeEnvironmentSetup(): Promise<EnvironmentSetupStatus> {
  const store = getStore();
  const system = store.get("system");
  store.set("system", { ...system, environmentSetupDone: true });
  const tools = await toolSnapshots();
  return {
    needed: false,
    done: true,
    running,
    tools,
  };
}

/**
 * Install missing environment tools in order. Skips tools already available.
 * Marks setup done when every step succeeds.
 */
export async function runEnvironmentSetup(
  onProgress?: (ev: EnvironmentSetupProgress) => void
): Promise<EnvironmentSetupStatus> {
  if (running) throw new Error("Environment setup already in progress");
  running = true;
  const stepCount = STEPS.length;
  let failed = false;

  try {
    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i]!;
      onProgress?.({
        step,
        stepIndex: i,
        stepCount,
        phase: "check",
        percent: 0,
        message: `Checking ${label(step)}…`,
      });

      const already = await isAvailable(step);
      if (already) {
        onProgress?.({
          step,
          stepIndex: i,
          stepCount,
          phase: "skip",
          percent: 100,
          message: `${label(step)} already installed`,
          toolAvailable: true,
        });
        continue;
      }

      try {
        await installStep(step, (phase, percent, message) => {
          onProgress?.({
            step,
            stepIndex: i,
            stepCount,
            phase,
            percent,
            message,
          });
        });
        onProgress?.({
          step,
          stepIndex: i,
          stepCount,
          phase: "done",
          percent: 100,
          message: `${label(step)} ready`,
          toolAvailable: true,
        });
      } catch (e) {
        failed = true;
        const message = e instanceof Error ? e.message : String(e);
        onProgress?.({
          step,
          stepIndex: i,
          stepCount,
          phase: "error",
          percent: 0,
          message,
          toolAvailable: false,
        });
        // Continue remaining steps so one failure does not abort the whole setup.
      }
    }

    const tools = await toolSnapshots();
    const allOk =
      tools.ffmpeg.available && tools.ytdlp.available && tools.playwright.available;

    if (allOk && !failed) {
      await completeEnvironmentSetup();
      return {
        needed: false,
        done: true,
        running: false,
        tools,
      };
    }

    return {
      needed: !getStore().get("system")?.environmentSetupDone,
      done: Boolean(getStore().get("system")?.environmentSetupDone),
      running: false,
      tools,
    };
  } finally {
    running = false;
  }
}

function label(step: EnvironmentSetupStep): string {
  if (step === "ffmpeg") return "ffmpeg";
  if (step === "ytdlp") return "yt-dlp";
  return "Playwright Chromium";
}

async function isAvailable(step: EnvironmentSetupStep): Promise<boolean> {
  if (step === "ffmpeg") return (await getFfmpegStatus()).available;
  if (step === "ytdlp") return (await getYtdlpStatus()).available;
  return (await getPlaywrightStatus()).available;
}

async function installStep(
  step: EnvironmentSetupStep,
  onProgress: (
    phase: EnvironmentSetupProgress["phase"],
    percent: number,
    message: string
  ) => void
): Promise<void> {
  if (step === "ffmpeg") {
    await installFfmpeg((ev) => onProgress(ev.phase, ev.percent, ev.message));
    return;
  }
  if (step === "ytdlp") {
    await installYtdlp((ev) => onProgress(ev.phase, ev.percent, ev.message));
    return;
  }
  await installPlaywrightChromium((ev) => onProgress(ev.phase, ev.percent, ev.message));
}

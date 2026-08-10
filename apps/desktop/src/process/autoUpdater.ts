/**
 * GitHub Releases auto-update via electron-updater.
 * Feed comes from electron-builder publish config embedded at package time.
 */

import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";
import log from "electron-log";
import semver from "semver";
import type { AutoUpdateStatus, UpdateCheckRequest } from "../common/update/types";

const GITHUB_OWNER = "vannyakh";
const GITHUB_REPO = "Pinforge";
const FORCE_DEV_ENV = "PINFORGE_FORCE_DEV_UPDATE";
const DISABLE_ENV = "PINFORGE_DISABLE_AUTO_UPDATE";

autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let lastStatus: AutoUpdateStatus = {
  status: "idle",
  currentVersion: app.getVersion(),
  canInstall: false,
};

let checking = false;
let wired = false;

function canUseUpdater(): boolean {
  if (process.env[DISABLE_ENV] === "1") return false;
  if (app.isPackaged) return true;
  return process.env[FORCE_DEV_ENV] === "1";
}

function broadcast(partial: Partial<AutoUpdateStatus>) {
  lastStatus = {
    ...lastStatus,
    currentVersion: app.getVersion(),
    canInstall: canUseUpdater(),
    ...partial,
  };
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("update:status", lastStatus);
  }
}

function notesFromInfo(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes;
  if (!notes) return undefined;
  if (typeof notes === "string") return notes;
  if (Array.isArray(notes)) {
    return notes
      .map((n) => (typeof n === "string" ? n : n.note || ""))
      .filter(Boolean)
      .join("\n");
  }
  return undefined;
}

function releaseUrlFor(version: string): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version.replace(/^v/, "")}`;
}

function wireEvents() {
  if (wired) return;
  wired = true;

  autoUpdater.on("checking-for-update", () => {
    broadcast({ status: "checking", error: undefined, progress: undefined });
  });

  autoUpdater.on("update-available", (info) => {
    broadcast({
      status: "available",
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: notesFromInfo(info),
      releaseUrl: releaseUrlFor(info.version),
      error: undefined,
      progress: undefined,
    });
  });

  autoUpdater.on("update-not-available", () => {
    broadcast({
      status: "not-available",
      version: undefined,
      releaseNotes: undefined,
      progress: undefined,
      error: undefined,
    });
  });

  autoUpdater.on("download-progress", (p: ProgressInfo) => {
    broadcast({
      status: "downloading",
      progress: {
        bytesPerSecond: p.bytesPerSecond,
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
      },
      error: undefined,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    broadcast({
      status: "downloaded",
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: notesFromInfo(info),
      releaseUrl: releaseUrlFor(info.version),
      progress: undefined,
      error: undefined,
    });
  });

  autoUpdater.on("error", (err) => {
    broadcast({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      progress: undefined,
    });
    checking = false;
  });
}

/** Optional GitHub API peek (works in unpackaged builds for About UI). */
async function peekGitHubLatest(
  includePrerelease: boolean
): Promise<{ version: string; htmlUrl: string; body?: string; publishedAt?: string } | null> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=15`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Pinforge-Updater",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub releases request failed (${res.status})`);
  }
  const releases = (await res.json()) as Array<{
    tag_name: string;
    name?: string;
    body?: string;
    html_url: string;
    published_at?: string;
    draft: boolean;
    prerelease: boolean;
  }>;
  const hit = releases.find((r) => {
    if (r.draft) return false;
    if (!includePrerelease && r.prerelease) return false;
    return Boolean(r.tag_name);
  });
  if (!hit) return null;
  const version = hit.tag_name.replace(/^v/i, "");
  return {
    version,
    htmlUrl: hit.html_url,
    body: hit.body,
    publishedAt: hit.published_at,
  };
}

function semverGt(a: string, b: string): boolean {
  const av = semver.valid(a);
  const bv = semver.valid(b);
  return Boolean(av && bv && semver.gt(av, bv));
}

export function getUpdateStatus(): AutoUpdateStatus {
  return {
    ...lastStatus,
    currentVersion: app.getVersion(),
    canInstall: canUseUpdater(),
  };
}

export function initAutoUpdater(): void {
  wireEvents();
  lastStatus = {
    status: "idle",
    currentVersion: app.getVersion(),
    canInstall: canUseUpdater(),
  };

  if (!canUseUpdater()) {
    log.info("[update] Auto-updater idle (unpackaged or disabled)");
    return;
  }

  // Quiet startup check — user can also trigger from About
  setTimeout(() => {
    void checkForUpdates({ includePrerelease: false }).catch((err) => {
      log.warn("[update] Startup check failed:", err);
    });
  }, 4_000);
}

export async function checkForUpdates(
  req: UpdateCheckRequest = {}
): Promise<AutoUpdateStatus> {
  const includePrerelease = Boolean(req.includePrerelease);
  wireEvents();

  if (checking) return getUpdateStatus();
  checking = true;
  broadcast({ status: "checking", error: undefined });

  try {
    if (canUseUpdater()) {
      autoUpdater.allowPrerelease = includePrerelease;
      autoUpdater.allowDowngrade = false;
      const result = await autoUpdater.checkForUpdates();
      // Events update lastStatus; ensure we return the latest
      if (result?.updateInfo?.version) {
        const latest = result.updateInfo.version;
        if (semverGt(latest, app.getVersion())) {
          broadcast({
            status: "available",
            version: latest,
            releaseDate: result.updateInfo.releaseDate,
            releaseNotes: notesFromInfo(result.updateInfo),
            releaseUrl: releaseUrlFor(latest),
          });
        }
      }
      return getUpdateStatus();
    }

    // Dev / unpackaged: GitHub API info only (cannot install via updater)
    const latest = await peekGitHubLatest(includePrerelease);
    if (!latest) {
      broadcast({
        status: "not-available",
        error: undefined,
        version: undefined,
      });
      return getUpdateStatus();
    }
    if (semverGt(latest.version, app.getVersion())) {
      broadcast({
        status: "available",
        version: latest.version,
        releaseNotes: latest.body,
        releaseDate: latest.publishedAt,
        releaseUrl: latest.htmlUrl,
        canInstall: false,
      });
    } else {
      broadcast({
        status: "not-available",
        version: latest.version,
        releaseUrl: latest.htmlUrl,
      });
    }
    return getUpdateStatus();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    broadcast({ status: "error", error: message });
    return getUpdateStatus();
  } finally {
    checking = false;
  }
}

export async function downloadUpdate(): Promise<AutoUpdateStatus> {
  wireEvents();
  if (!canUseUpdater()) {
    broadcast({
      status: "error",
      error:
        "In-app install needs a packaged build. Open the GitHub release to download the installer.",
    });
    return getUpdateStatus();
  }
  if (lastStatus.status !== "available" && lastStatus.status !== "error") {
    // Allow retry from error after an available state
    if (lastStatus.status !== "downloading") {
      await checkForUpdates({ includePrerelease: autoUpdater.allowPrerelease });
    }
  }
  try {
    broadcast({ status: "downloading", error: undefined });
    await autoUpdater.downloadUpdate();
    return getUpdateStatus();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    broadcast({ status: "error", error: message });
    return getUpdateStatus();
  }
}

export function quitAndInstall(): { ok: boolean; message?: string } {
  if (!canUseUpdater()) {
    return { ok: false, message: "Install only works in packaged builds." };
  }
  if (lastStatus.status !== "downloaded") {
    return { ok: false, message: "Download the update before installing." };
  }
  try {
    // isSilent=false, isForceRunAfter=true
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    broadcast({ status: "error", error: message });
    return { ok: false, message };
  }
}

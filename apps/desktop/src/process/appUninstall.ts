import { app, shell } from "electron";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { markAppQuitting } from "./systemPrefs";

export type AppUninstallOptions = {
  clearData: boolean;
};

export type AppUninstallResult = {
  ok: boolean;
  message?: string;
};

/**
 * Best-effort path to the Windows NSIS uninstaller next to the installed app.
 * Packaged layout: <installDir>/Pinforge.exe — Uninstall Pinforge.exe sits beside it.
 */
function windowsUninstallerPath(): string | null {
  if (process.platform !== "win32" || !app.isPackaged) return null;
  const installDir = dirname(process.execPath);
  const candidates = [
    join(installDir, "Uninstall Pinforge.exe"),
    join(installDir, "uninstall.exe"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function clearAppUserData(): Promise<void> {
  const userData = app.getPath("userData");
  const tempRoot = join(app.getPath("temp"), "Pinforge");

  // Remove known app temp first (outside userData).
  try {
    await rm(tempRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  // Wipe userData contents (settings, tools, mediacore, logs, extensions).
  // Delete children instead of the folder itself — the folder is often locked
  // while Electron is running. Do not touch the user's media outDir.
  try {
    const entries = await readdir(userData);
    await Promise.all(
      entries.map((name) => rm(join(userData, name), { recursive: true, force: true }))
    );
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Optionally clear app userData, then quit.
 * On Windows packaged builds, try to launch the NSIS uninstaller after clear.
 */
export async function uninstallApp(opts: AppUninstallOptions): Promise<AppUninstallResult> {
  markAppQuitting();

  if (opts.clearData) {
    try {
      await clearAppUserData();
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const uninstaller = windowsUninstallerPath();
  if (uninstaller) {
    try {
      await shell.openPath(uninstaller);
    } catch {
      /* still quit */
    }
  }

  // Defer exit so the IPC reply can reach the renderer.
  setImmediate(() => {
    app.exit(0);
  });

  return { ok: true };
}

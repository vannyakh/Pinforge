/**
 * CapCut-style installer window geometry (fixed size, no native frame chrome).
 */

import type { BrowserWindow, Rectangle } from "electron";

export const INSTALLER_WIDTH = 960;
export const INSTALLER_HEIGHT = 640;

let savedBounds: Rectangle | null = null;
let installerActive = false;

export function isInstallerWindowActive(): boolean {
  return installerActive;
}

function setNativeWindowButtons(win: BrowserWindow, visible: boolean): void {
  if (process.platform !== "darwin") return;
  try {
    win.setWindowButtonVisibility(visible);
  } catch {
    /* older Electron */
  }
}

/** Mark installer mode when the window was already created at installer size. */
export function markInstallerWindowStarted(win?: BrowserWindow): void {
  installerActive = true;
  savedBounds = null;
  if (win) setNativeWindowButtons(win, false);
}

/** Apply fixed-size rounded installer chrome (no OS title bar / traffic lights). */
export function enterInstallerWindow(win: BrowserWindow): void {
  if (!installerActive) {
    installerActive = true;
    if (win.isMaximized()) win.unmaximize();
    savedBounds = win.getBounds();
    win.setMinimizable(false);
    win.setMaximizable(false);
    win.setResizable(false);
    win.setClosable(false);
    win.setMinimumSize(INSTALLER_WIDTH, INSTALLER_HEIGHT);
    win.setSize(INSTALLER_WIDTH, INSTALLER_HEIGHT, true);
    win.center();
  }
  // Always re-hide native controls (idempotent) — avoids leftover traffic lights.
  setNativeWindowButtons(win, false);
}

/** Restore normal app window after setup / uninstall cancel. */
export function exitInstallerWindow(win: BrowserWindow): void {
  if (!installerActive) return;
  installerActive = false;
  win.setClosable(true);
  win.setMaximizable(true);
  win.setMinimizable(true);
  win.setResizable(true);
  win.setMinimumSize(860, 600);
  if (savedBounds) {
    win.setBounds(savedBounds, true);
    savedBounds = null;
  } else {
    win.setSize(1180, 780, true);
    win.center();
  }
  setNativeWindowButtons(win, true);
}

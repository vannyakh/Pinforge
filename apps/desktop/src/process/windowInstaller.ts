/**
 * CapCut-style installer window geometry (fixed size, no close).
 */

import type { BrowserWindow, Rectangle } from "electron";

export const INSTALLER_WIDTH = 960;
export const INSTALLER_HEIGHT = 640;

let savedBounds: Rectangle | null = null;
let installerActive = false;

export function isInstallerWindowActive(): boolean {
  return installerActive;
}

/** Mark installer mode when the window was already created at installer size. */
export function markInstallerWindowStarted(): void {
  installerActive = true;
  savedBounds = null;
}

/** Apply fixed-size rounded installer chrome. */
export function enterInstallerWindow(win: BrowserWindow): void {
  if (installerActive) return;
  installerActive = true;
  if (win.isMaximized()) win.unmaximize();
  savedBounds = win.getBounds();
  win.setMinimizable(true);
  win.setMaximizable(false);
  win.setResizable(false);
  win.setClosable(false);
  win.setMinimumSize(INSTALLER_WIDTH, INSTALLER_HEIGHT);
  win.setSize(INSTALLER_WIDTH, INSTALLER_HEIGHT, true);
  win.center();
}

/** Restore normal app window after setup. */
export function exitInstallerWindow(win: BrowserWindow): void {
  if (!installerActive) return;
  installerActive = false;
  win.setClosable(true);
  win.setMaximizable(true);
  win.setResizable(true);
  win.setMinimumSize(860, 600);
  if (savedBounds) {
    win.setBounds(savedBounds, true);
    savedBounds = null;
  } else {
    win.setSize(1180, 780, true);
    win.center();
  }
}

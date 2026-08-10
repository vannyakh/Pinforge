/** Shared auto-update types (main ↔ preload ↔ renderer). */

export type AutoUpdateStatusType =
  "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";

export interface AutoUpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface AutoUpdateStatus {
  status: AutoUpdateStatusType;
  /** Installed app version. */
  currentVersion: string;
  /** Newer version from GitHub Releases when available. */
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  /** GitHub release page URL when known. */
  releaseUrl?: string;
  progress?: AutoUpdateProgress;
  error?: string;
  /** True when electron-updater can install this build (packaged app). */
  canInstall?: boolean;
}

export interface UpdateCheckRequest {
  includePrerelease?: boolean;
}

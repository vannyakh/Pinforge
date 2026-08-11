/**
 * MediaCore façade — wires processMedia so @pinforge/engine never imports @pinforge/core.
 */
import {
  configureMediaCore as configureEngine,
  getMediaCore,
  MediaCore,
  jobStatusToPackStatus,
  JobScheduler,
  runJobWorker,
  type MediaCoreOptions,
  type MediaCoreDownloadOptions,
  type MediaCoreJobHandle,
  type ProcessMediaFn,
  type JobWorkerOptions,
} from "@pinforge/engine";
import { processMedia } from "./process";

export {
  getMediaCore,
  MediaCore,
  jobStatusToPackStatus,
  JobScheduler,
  runJobWorker,
};
export type {
  MediaCoreOptions,
  MediaCoreDownloadOptions,
  MediaCoreJobHandle,
  ProcessMediaFn,
  JobWorkerOptions,
};

export function configureMediaCore(
  opts: Omit<MediaCoreOptions, "processMedia"> & { processMedia?: ProcessMediaFn } = {}
): MediaCore {
  return configureEngine({
    ...opts,
    processMedia: opts.processMedia ?? processMedia,
  });
}

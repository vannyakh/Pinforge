/**
 * Unified downloader entry — prefer range downloader when resume is requested.
 */
export { rangeDownloadToFile, probeRangeResource } from "./range-downloader";
export type { RangeDownloadOptions, RangeProbe } from "./range-downloader";
export { downloadSegments } from "./segment-downloader";
export type { SegmentDownloadOptions, SegmentDownloadResult } from "./segment-downloader";
export { ResumeManager, CheckpointStore, validateCheckpoint, recoverCheckpoint } from "./resume";
export type { RecoveryResult } from "./resume";

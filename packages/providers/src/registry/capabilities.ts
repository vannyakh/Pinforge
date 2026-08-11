/**
 * Platform feature matrix — what each provider can realistically support.
 * Values: "yes" | "limited" | "no"
 */

import type { FeatureSupport, PlatformFeature, ProviderFeatureMatrix } from "@pinforge/types";

export type { FeatureSupport, PlatformFeature, ProviderFeatureMatrix };

/** Core engine features every live provider inherits via MediaCore. */
export const CORE_ENGINE_FEATURES = [
  "queue",
  "pauseResume",
  "checkpoints",
  "retry",
  "progressEta",
  "crashRecovery",
  "ffmpegMerge",
] as const;

export type CoreEngineFeature = (typeof CORE_ENGINE_FEATURES)[number];

export const YOUTUBE_FEATURES: ProviderFeatureMatrix = {
  singleVideo: "yes",
  audioOnly: "yes",
  photo: "limited",
  carousel: "no",
  story: "no",
  reelsShorts: "yes",
  playlist: "yes",
  profileBatch: "limited",
  subtitles: "yes",
  thumbnail: "yes",
  metadata: "yes",
  qualitySelect: "yes",
  watermarkRemoval: "no",
  resume: "yes",
};

export const TIKTOK_FEATURES: ProviderFeatureMatrix = {
  singleVideo: "yes",
  audioOnly: "limited",
  photo: "limited",
  carousel: "limited",
  story: "limited",
  reelsShorts: "yes",
  playlist: "limited",
  profileBatch: "limited",
  subtitles: "no",
  thumbnail: "yes",
  metadata: "yes",
  qualitySelect: "limited",
  watermarkRemoval: "limited",
  resume: "yes",
};

export const FACEBOOK_FEATURES: ProviderFeatureMatrix = {
  singleVideo: "yes",
  audioOnly: "limited",
  photo: "limited",
  carousel: "limited",
  story: "limited",
  reelsShorts: "limited",
  playlist: "limited",
  profileBatch: "limited",
  subtitles: "no",
  thumbnail: "limited",
  metadata: "limited",
  qualitySelect: "limited",
  watermarkRemoval: "no",
  resume: "yes",
};

export const INSTAGRAM_FEATURES: ProviderFeatureMatrix = {
  singleVideo: "yes",
  audioOnly: "limited",
  photo: "yes",
  carousel: "yes",
  story: "limited",
  reelsShorts: "yes",
  playlist: "limited",
  profileBatch: "limited",
  subtitles: "no",
  thumbnail: "yes",
  metadata: "limited",
  qualitySelect: "limited",
  watermarkRemoval: "no",
  resume: "yes",
};

export const PINTEREST_FEATURES: ProviderFeatureMatrix = {
  singleVideo: "limited",
  audioOnly: "no",
  photo: "yes",
  carousel: "yes",
  story: "no",
  reelsShorts: "no",
  playlist: "limited",
  profileBatch: "limited",
  subtitles: "no",
  thumbnail: "yes",
  metadata: "limited",
  qualitySelect: "limited",
  watermarkRemoval: "no",
  resume: "yes",
};

export const STUB_FEATURES: ProviderFeatureMatrix = {
  singleVideo: "no",
  audioOnly: "no",
  photo: "no",
  carousel: "no",
  story: "no",
  reelsShorts: "no",
  playlist: "no",
  profileBatch: "no",
  subtitles: "no",
  thumbnail: "no",
  metadata: "no",
  qualitySelect: "no",
  watermarkRemoval: "no",
  resume: "no",
};

/** Generic sites via external yt-dlp (depends on site + installed binary). */
export const YTDLP_FEATURES: ProviderFeatureMatrix = {
  singleVideo: "yes",
  audioOnly: "yes",
  photo: "limited",
  carousel: "limited",
  story: "limited",
  reelsShorts: "yes",
  playlist: "limited",
  profileBatch: "limited",
  subtitles: "limited",
  thumbnail: "limited",
  metadata: "yes",
  qualitySelect: "yes",
  watermarkRemoval: "limited",
  resume: "limited",
};

export const PROVIDER_FEATURE_MATRIX: Record<string, ProviderFeatureMatrix> = {
  youtube: YOUTUBE_FEATURES,
  tiktok: TIKTOK_FEATURES,
  facebook: FACEBOOK_FEATURES,
  instagram: INSTAGRAM_FEATURES,
  pinterest: PINTEREST_FEATURES,
  ytdlp: YTDLP_FEATURES,
};

export function featuresForProvider(id: string): ProviderFeatureMatrix {
  return PROVIDER_FEATURE_MATRIX[id] ?? STUB_FEATURES;
}

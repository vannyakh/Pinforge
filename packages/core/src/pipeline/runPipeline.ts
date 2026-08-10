import {
  DEFAULT_ENHANCE_FEATURES,
  PRESETS,
  type EnhanceFeatures,
  type EnhancedAsset,
  type PipelineOptions,
} from "../types";
import { autoLevels } from "./steps/autoLevels";
import { denoise } from "./steps/denoise";
import { sharpen } from "./steps/sharpen";
import { upscale } from "./steps/upscale";
import { rustEnhance } from "../worker/rustWorker";

function resolveFeatures(
  presetName: keyof typeof PRESETS,
  partial?: Partial<EnhanceFeatures>
): EnhanceFeatures {
  const preset = PRESETS[presetName] ?? PRESETS.auto;
  const base: EnhanceFeatures = {
    ...DEFAULT_ENHANCE_FEATURES,
    autoLevels: preset.autoLevels,
    denoise: preset.denoise > 0,
    sharpen: preset.sharpen > 0,
    upscale: preset.upscale > 1,
  };
  return { ...base, ...partial };
}

function featuresMatchPreset(features: EnhanceFeatures, presetName: keyof typeof PRESETS): boolean {
  const preset = PRESETS[presetName] ?? PRESETS.auto;
  return (
    features.autoLevels === preset.autoLevels &&
    features.denoise === preset.denoise > 0 &&
    features.sharpen === preset.sharpen > 0 &&
    features.upscale === preset.upscale > 1
  );
}

/**
 * ONE function: buffer in → enhanced buffer out.
 * Prefers Pinforge Rust worker when features match the preset;
 * falls back to sharp JS pipeline (honors feature toggles).
 */
export async function runPipeline(buffer: Buffer, opts: PipelineOptions): Promise<EnhancedAsset> {
  const presetName = opts.preset ?? "auto";
  const features = resolveFeatures(presetName, opts.features);

  if (featuresMatchPreset(features, presetName)) {
    try {
      const rust = await rustEnhance(buffer, presetName);
      if (rust) {
        return { buffer: rust.buffer, ext: rust.ext };
      }
    } catch {
      /* fall through to sharp */
    }
  }

  return runSharpPipeline(buffer, presetName, features);
}

async function runSharpPipeline(
  buffer: Buffer,
  presetName: keyof typeof PRESETS,
  features: EnhanceFeatures
): Promise<EnhancedAsset> {
  const preset = PRESETS[presetName] ?? PRESETS.auto;
  let current = buffer;

  if (features.autoLevels) {
    current = await autoLevels(current, { strength: 0.7 });
  }

  if (features.denoise && preset.denoise > 0) {
    current = await denoise(current, { strength: preset.denoise });
  } else if (features.denoise) {
    current = await denoise(current, { strength: 0.35 });
  }

  const scale = features.upscale ? Math.max(preset.upscale, 2) : 1;
  if (scale > 1) {
    current = await upscale(current, { scale });
  }

  if (features.sharpen && preset.sharpen > 0) {
    current = await sharpen(current, { strength: preset.sharpen });
  } else if (features.sharpen) {
    current = await sharpen(current, { strength: 0.6 });
  }

  const sharp = (await import("sharp")).default;
  const out = await sharp(current).png({ compressionLevel: 6 }).toBuffer();

  return { buffer: out, ext: "png" };
}

import { PRESETS, type EnhancedAsset, type PipelineOptions } from "../types";
import { autoLevels } from "./steps/autoLevels";
import { denoise } from "./steps/denoise";
import { sharpen } from "./steps/sharpen";
import { upscale } from "./steps/upscale";
import { rustEnhance } from "../worker/rustWorker";

/**
 * ONE function: buffer in → enhanced buffer out.
 * Prefers Pinforge Rust worker (OpenCut-style native crate) when built;
 * falls back to sharp JS pipeline.
 */
export async function runPipeline(
  buffer: Buffer,
  opts: PipelineOptions
): Promise<EnhancedAsset> {
  const presetName = opts.preset ?? "auto";

  try {
    const rust = await rustEnhance(buffer, presetName);
    if (rust) {
      return { buffer: rust.buffer, ext: rust.ext };
    }
  } catch {
    /* fall through to sharp */
  }

  return runSharpPipeline(buffer, opts);
}

async function runSharpPipeline(
  buffer: Buffer,
  opts: PipelineOptions
): Promise<EnhancedAsset> {
  const preset = PRESETS[opts.preset] ?? PRESETS.auto;
  let current = buffer;

  if (preset.autoLevels) {
    current = await autoLevels(current, { strength: 0.7 });
  }

  if (preset.denoise > 0) {
    current = await denoise(current, { strength: preset.denoise });
  }

  if (preset.upscale > 1) {
    current = await upscale(current, { scale: preset.upscale });
  }

  if (preset.sharpen > 0) {
    current = await sharpen(current, { strength: preset.sharpen });
  }

  const sharp = (await import("sharp")).default;
  const out = await sharp(current).png({ compressionLevel: 6 }).toBuffer();

  return { buffer: out, ext: "png" };
}

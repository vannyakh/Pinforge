import type { EnhanceStepOptions } from "@pinforge/types";

/**
 * Mild median filter for noise reduction.
 */
export async function denoise(input: Buffer, opts: EnhanceStepOptions = {}): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const strength = Math.min(1, Math.max(0, opts.strength ?? 0.35));

  if (strength <= 0.01) return input;

  const size = strength < 0.45 ? 3 : 5;
  return sharp(input).median(size).toBuffer();
}

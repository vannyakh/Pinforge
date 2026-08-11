import type { EnhanceStepOptions } from "@pinforge/types";

/**
 * Stretch luminance toward a fuller range via normalize + mild gamma.
 * Strength 0–1 controls how aggressive the stretch is.
 */
export async function autoLevels(input: Buffer, opts: EnhanceStepOptions = {}): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const strength = Math.min(1, Math.max(0, opts.strength ?? 0.7));

  // Lower percentile = more aggressive; strength maps 1%–10%
  const lower = Math.round(10 - strength * 9);
  const upper = Math.round(90 + strength * 9);
  const gamma = 1 + (1 - strength) * 0.15;

  return sharp(input).normalize({ lower, upper }).gamma(gamma).toBuffer();
}

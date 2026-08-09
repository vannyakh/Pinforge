import type { EnhanceStepOptions } from "../../types";

/**
 * Unsharp-mask style sharpen via sharp's sharpen().
 */
export async function sharpen(
  input: Buffer,
  opts: EnhanceStepOptions = {}
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const strength = Math.min(1.5, Math.max(0, opts.strength ?? 0.6));

  if (strength <= 0.01) return input;

  const sigma = 0.5 + strength * 0.8;
  const m1 = 0.5 + strength * 0.8;
  const m2 = 0.2 + strength * 0.4;

  return sharp(input).sharpen({ sigma, m1, m2 }).toBuffer();
}

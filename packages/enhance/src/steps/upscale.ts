import type { EnhanceStepOptions } from "@pinforge/types";

/**
 * Lanczos3 resize by scale factor (typically 1 or 2).
 */
export async function upscale(
  input: Buffer,
  opts: EnhanceStepOptions & { scale?: number } = {}
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const scale = opts.scale ?? 1;

  if (scale <= 1) return input;

  const meta = await sharp(input).metadata();
  const width = meta.width;
  const height = meta.height;

  if (!width || !height) return input;

  return sharp(input)
    .resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      kernel: "lanczos3",
      fit: "fill",
    })
    .toBuffer();
}

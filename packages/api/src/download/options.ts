import type { FormatPreset, PresetName, ProcessBoardOptions } from "@pinforge/types";

export interface NormalizeDownloadOptionsInput {
  outDir: string;
  format?: FormatPreset | string;
  /** When false, skip image enhance. */
  enhance?: boolean;
  /**
   * Enhance preset name, or `"off"` / `"false"` to disable enhance.
   * When `enhance` is also set, the boolean wins for the enhance flag.
   */
  preset?: PresetName | "off" | "false" | string;
  extractorUrl?: string;
  /** Group multi-file downloads in their own folder (default true). */
  packFolders?: boolean;
}

export type NormalizedDownloadOptions = Pick<
  ProcessBoardOptions,
  "outDir" | "preset" | "enhance" | "format" | "extractorUrl" | "packFolders"
>;

const FORMAT_PRESETS: FormatPreset[] = ["best", "mp4", "audio-only"];
const PRESET_NAMES: PresetName[] = ["auto", "soft", "crisp", "upscale"];

function asFormatPreset(value?: string): FormatPreset | undefined {
  if (!value) return undefined;
  return FORMAT_PRESETS.includes(value as FormatPreset) ? (value as FormatPreset) : undefined;
}

function asPresetName(value?: string): PresetName {
  if (value && PRESET_NAMES.includes(value as PresetName)) return value as PresetName;
  return "auto";
}

/**
 * Map CLI / UI download knobs onto `processMedia` options.
 */
export function normalizeDownloadOptions(
  input: NormalizeDownloadOptionsInput
): NormalizedDownloadOptions {
  const enhanceOff = input.enhance === false || input.preset === "off" || input.preset === "false";
  const preset = enhanceOff ? "auto" : asPresetName(input.preset);

  return {
    outDir: input.outDir,
    preset,
    enhance: input.enhance !== undefined ? Boolean(input.enhance) && !enhanceOff : !enhanceOff,
    format: asFormatPreset(input.format),
    extractorUrl: input.extractorUrl,
    packFolders: input.packFolders !== false,
  };
}

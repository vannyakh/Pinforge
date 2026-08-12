import type { NamingTemplates, ResolvedMedia } from "./types";
import { DEFAULT_NAMING_TEMPLATES } from "./types";

export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80)
      .replace(/^-+|-+$/g, "") || "media"
  );
}

export type NamingVars = Record<string, string | number | undefined>;

const NAMING_VAR_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/**
 * Expand `{key}` placeholders and sanitize for use as a path segment.
 * Empty placeholders are removed; repeated `-` are collapsed.
 */
export function renderNamingTemplate(template: string, vars: NamingVars): string {
  const expanded = template.replace(NAMING_VAR_RE, (_, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") return "";
    return String(v);
  });
  const collapsed = expanded
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitizeFilename(collapsed);
}

/**
 * Folder name for a download that produces several files.
 * Carousel items carry a `title (2)` / `pinId_1` suffix per asset — strip those
 * so every asset of one post lands in the same folder, and keep the source id
 * so a re-download reuses the folder (resume / duplicate skip still work).
 */
export function packFolderName(
  input: { title?: string; id?: string; provider?: string },
  folderTemplate?: string
): string {
  const title = (input.title ?? "").replace(/\s*\(\d+\)\s*$/, "").trim();
  const id = (input.id ?? "").replace(/_\d+$/, "").trim();
  const template = folderTemplate?.trim() || DEFAULT_NAMING_TEMPLATES.folderName;
  return renderNamingTemplate(template, {
    title: title || input.provider || "",
    id,
    provider: input.provider ?? "",
  });
}

export type ResolveMediaFileBaseInput = Pick<
  ResolvedMedia,
  "title" | "id" | "provider" | "channel" | "ext" | "height"
> & {
  /** YYYY-MM-DD when known (e.g. YouTube upload date). */
  date?: string;
};

export function resolveMediaFileBase(
  media: ResolveMediaFileBaseInput,
  opts: {
    naming?: NamingTemplates;
    quality?: string;
    index?: number;
    stamp?: string;
  } = {}
): string {
  const template = opts.naming?.fileName?.trim() || DEFAULT_NAMING_TEMPLATES.fileName;
  const idPart = media.id ?? "";
  const stamp = opts.stamp ?? "";
  const fallbackTitle = idPart ? media.provider : `${media.provider}${stamp}`;
  const date =
    media.date?.trim() ||
    new Date().toISOString().slice(0, 10);
  return renderNamingTemplate(template, {
    title: media.title?.trim() || fallbackTitle,
    id: idPart,
    provider: media.provider,
    channel: media.channel,
    ext: media.ext,
    quality: opts.quality,
    height: media.height != null ? String(media.height) : undefined,
    date,
    index: opts.index,
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

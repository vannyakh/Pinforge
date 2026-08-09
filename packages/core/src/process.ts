import fs from "node:fs/promises";
import path from "node:path";
import { runPipeline } from "./pipeline/runPipeline";
import type {
  DownloadResult,
  PresetName,
  ProcessOptions,
  ProcessResult,
  ProviderId,
  ResolvedMedia,
} from "./types";
import {
  detectProvider,
  isBoardUrl,
  resolveBoard,
  resolvePin,
  type MediaProvider,
} from "./providers";
import { sanitizeFilename, sleep } from "./utils";

export interface ProcessBoardOptions extends ProcessOptions {
  onProgress?: (info: {
    current: number;
    total: number;
    url: string;
    result?: ProcessResult;
    error?: string;
  }) => void;
}

async function writeResolved(
  media: ResolvedMedia,
  opts: ProcessOptions
): Promise<ProcessResult> {
  await fs.mkdir(opts.outDir, { recursive: true });

  const enhance = opts.enhance !== false && media.kind === "image" && media.buffer;
  const base = sanitizeFilename(media.title ?? `${media.provider}-${Date.now()}`);
  const stamp = Date.now();

  if (enhance && media.buffer) {
    const enhanced = await runPipeline(media.buffer, {
      preset: opts.preset ?? "auto",
    });
    const outPath = path.join(opts.outDir, `${base}-${stamp}.${enhanced.ext}`);
    const originalPath = path.join(opts.outDir, `${base}-${stamp}-original.${media.ext}`);
    await fs.writeFile(originalPath, media.buffer);
    await fs.writeFile(outPath, enhanced.buffer);
    return {
      outPath,
      originalPath,
      sourceUrl: media.sourceUrl,
      title: media.title,
      provider: media.provider,
      kind: media.kind,
    };
  }

  const buffer =
    media.buffer ??
    (media.filePath ? await fs.readFile(media.filePath) : null);
  if (!buffer) throw new Error("Resolved media has no buffer or file path");

  const outPath = path.join(opts.outDir, `${base}-${stamp}.${media.ext}`);
  await fs.writeFile(outPath, buffer);
  return {
    outPath,
    sourceUrl: media.sourceUrl,
    title: media.title,
    provider: media.provider,
    kind: media.kind,
  };
}

/**
 * Detect provider → resolve → save (enhance images when enabled).
 */
export async function processMedia(
  url: string,
  opts: ProcessBoardOptions
): Promise<DownloadResult> {
  const provider = detectProvider(url);

  if (provider.id === "pinterest" && isBoardUrl(url)) {
    return processPinterestBoard(url, opts, provider.id);
  }

  const resolved = await provider.resolve(url, {
    format: opts.format,
    outDir: opts.outDir,
    extractorUrl: opts.extractorUrl,
  });

  const list = Array.isArray(resolved) ? resolved : [resolved];
  const results: ProcessResult[] = [];
  const errors: { url: string; error: string }[] = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i]!;
    try {
      const result = await writeResolved(item, opts);
      results.push(result);
      opts.onProgress?.({
        current: i + 1,
        total: list.length,
        url: item.sourceUrl,
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ url: item.sourceUrl, error: message });
      opts.onProgress?.({
        current: i + 1,
        total: list.length,
        url: item.sourceUrl,
        error: message,
      });
    }
  }

  return {
    results,
    errors,
    provider: provider.id,
    kind: list.length > 1 ? "batch" : "single",
  };
}

async function processPinterestBoard(
  url: string,
  opts: ProcessBoardOptions,
  providerId: ProviderId
): Promise<DownloadResult> {
  const { pinUrls, boardName } = await resolveBoard(url);
  const delayMs = opts.delayMs ?? 1500;
  const outDir = boardName
    ? path.join(opts.outDir, sanitizeFilename(boardName))
    : opts.outDir;

  const results: ProcessResult[] = [];
  const errors: { url: string; error: string }[] = [];

  for (let i = 0; i < pinUrls.length; i++) {
    const pinUrl = pinUrls[i]!;
    try {
      const asset = await resolvePin(pinUrl);
      const result = await writeResolved(
        {
          kind: asset.kind ?? "image",
          buffer: asset.buffer,
          ext: asset.ext,
          sourceUrl: asset.sourceUrl,
          title: asset.title,
          provider: providerId,
        },
        { ...opts, outDir }
      );
      results.push(result);
      opts.onProgress?.({
        current: i + 1,
        total: pinUrls.length,
        url: pinUrl,
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ url: pinUrl, error: message });
      opts.onProgress?.({
        current: i + 1,
        total: pinUrls.length,
        url: pinUrl,
        error: message,
      });
    }
    if (i < pinUrls.length - 1) await sleep(delayMs);
  }

  return { results, errors, provider: providerId, kind: "batch" };
}

/** @deprecated Prefer processMedia — kept for desktop IPC compatibility. */
export async function processPin(
  url: string,
  opts: ProcessOptions
): Promise<ProcessResult> {
  const { results, errors } = await processMedia(url, opts);
  if (results[0]) return results[0];
  throw new Error(errors[0]?.error ?? "Download failed");
}

/** @deprecated Prefer processMedia */
export async function processBoard(
  url: string,
  opts: ProcessBoardOptions
): Promise<{ results: ProcessResult[]; errors: { url: string; error: string }[] }> {
  const res = await processMedia(url, opts);
  return { results: res.results, errors: res.errors };
}

export async function processUrl(
  url: string,
  opts: ProcessBoardOptions
): Promise<{
  kind: "pin" | "board";
  results: ProcessResult[];
  errors: { url: string; error: string }[];
}> {
  const res = await processMedia(url, opts);
  return {
    kind: res.kind === "batch" ? "board" : "pin",
    results: res.results,
    errors: res.errors,
  };
}

export function detectMediaProvider(url: string): MediaProvider {
  return detectProvider(url);
}

export type { PresetName, ProcessOptions, ProcessResult };

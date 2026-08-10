import type {
  DownloadMode,
  FormatPreset,
  ProviderId,
  ResolvedMedia,
  YoutubeDownloadOptions,
} from "../types";
import type { ProviderFeatureMatrix } from "./capabilities";

export interface ResolveContext {
  format?: FormatPreset;
  outDir?: string;
  /** Piped-compatible API base for YouTube (optional). */
  extractorUrl?: string;
  fragmentConcurrency?: number;
  signal?: AbortSignal;
  youtube?: YoutubeDownloadOptions;
  /** Byte-level download progress (YouTube / fragment downloads). */
  onByteProgress?: (info: { downloaded: number; total: number | null; phase?: string }) => void;
}

export interface MediaProvider {
  id: ProviderId;
  label: string;
  /** false = stub / not downloadable */
  live: boolean;
  formats?: FormatPreset[];
  /** Supported download shapes for this site. */
  modes?: DownloadMode[];
  /** Platform feature matrix (yes / limited / no). */
  features?: ProviderFeatureMatrix;
  match: (url: string) => boolean;
  resolve: (url: string, ctx?: ResolveContext) => Promise<ResolvedMedia | ResolvedMedia[]>;
}

export class ProviderNotImplementedError extends Error {
  readonly providerId: ProviderId;
  readonly providerLabel: string;

  constructor(id: ProviderId, label: string) {
    super(`${label} download is not available`);
    this.name = "ProviderNotImplementedError";
    this.providerId = id;
    this.providerLabel = label;
  }
}

export class ProviderNotFoundError extends Error {
  constructor(url: string) {
    super(`No provider matches this URL: ${url}`);
    this.name = "ProviderNotFoundError";
  }
}

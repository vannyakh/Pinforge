import type { FormatPreset, ProviderId, ResolvedMedia } from "../types";

export interface ResolveContext {
  format?: FormatPreset;
  outDir?: string;
  /** Piped-compatible API base for YouTube (optional). */
  extractorUrl?: string;
}

export interface MediaProvider {
  id: ProviderId;
  label: string;
  /** false = stub / coming soon */
  live: boolean;
  formats?: FormatPreset[];
  match: (url: string) => boolean;
  resolve: (url: string, ctx?: ResolveContext) => Promise<ResolvedMedia | ResolvedMedia[]>;
}

export class ProviderNotImplementedError extends Error {
  readonly providerId: ProviderId;
  readonly providerLabel: string;

  constructor(id: ProviderId, label: string) {
    super(`${label} download is coming soon`);
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

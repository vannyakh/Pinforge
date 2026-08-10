export type ExtractorKind = "http" | "hls" | "dash" | "provider";

export interface ExtractorContext {
  url: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  referer?: string;
}

export interface Extractor {
  kind: ExtractorKind;
  supports(url: string): boolean;
}

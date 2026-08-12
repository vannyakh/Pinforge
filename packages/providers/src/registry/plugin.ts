/**
 * Provider plugin contract — third-party extractors inherit MediaCore queue/resume/FFmpeg.
 */

import type {
  DownloadMode,
  FormatPreset,
  MediaKind,
  ProviderId,
  ResolvedMedia,
} from "@pinforge/types";
import type { MediaProvider, ResolveContext } from "./types";
import { registerProvider } from "./index";
import type { ProviderFeatureMatrix } from "./capabilities";
import { featuresForProvider, CORE_ENGINE_FEATURES } from "./capabilities";

/** Extracted media descriptor before binary download (plugin extract phase). */
export interface MediaInfo {
  kind: MediaKind;
  /** Direct media URL(s) — carousel/album may have many. */
  urls: string[];
  title?: string;
  id?: string;
  channel?: string;
  thumbnail?: string;
  description?: string;
  durationSec?: number;
  /** Provider-specific extras (stats, music title, board name, …). */
  metadata?: Record<string, unknown>;
  /** Preferred file extension hint. */
  ext?: string;
}

export interface ProviderPlugin {
  id: ProviderId | string;
  version: string;
  label: string;
  /** Hosts this plugin claims (optional; canHandle is authoritative). */
  hosts?: RegExp[];
  formats?: FormatPreset[];
  modes?: DownloadMode[];
  features?: Partial<ProviderFeatureMatrix>;
  canHandle(url: string): boolean;
  extract(url: string, ctx?: ResolveContext): Promise<MediaInfo | MediaInfo[]>;
  /**
   * Optional: download binaries yourself. Default uses MediaCore HTTP download
   * via the built-in adapter (fetchBinary through resolve).
   */
  download?: (info: MediaInfo, ctx?: ResolveContext) => Promise<ResolvedMedia | ResolvedMedia[]>;
}

export interface RegisteredPluginInfo {
  id: string;
  version: string;
  label: string;
  features: ProviderFeatureMatrix;
  coreFeatures: typeof CORE_ENGINE_FEATURES;
  formats?: FormatPreset[];
  modes?: DownloadMode[];
}

const plugins = new Map<string, ProviderPlugin>();

export function listProviderPlugins(): RegisteredPluginInfo[] {
  return [...plugins.values()].map((p) => ({
    id: p.id,
    version: p.version,
    label: p.label,
    features: {
      ...featuresForProvider(p.id),
      ...p.features,
    } as ProviderFeatureMatrix,
    coreFeatures: CORE_ENGINE_FEATURES,
    formats: p.formats,
    modes: p.modes,
  }));
}

export function getProviderPlugin(id: string): ProviderPlugin | undefined {
  return plugins.get(id);
}

/**
 * Register a plugin as a live MediaProvider. The plugin owns extract();
 * MediaCore still owns jobs, queue, pause/resume, checkpoints, and FFmpeg.
 */
export function registerProviderPlugin(plugin: ProviderPlugin): MediaProvider {
  plugins.set(plugin.id, plugin);

  const features = {
    ...featuresForProvider(plugin.id),
    ...plugin.features,
  } as ProviderFeatureMatrix;

  const provider: MediaProvider = {
    id: plugin.id as ProviderId,
    label: plugin.label,
    live: true,
    formats: plugin.formats ?? ["best", "mp4"],
    modes: plugin.modes ?? ["single"],
    features,
    match: (url) => plugin.canHandle(url),
    resolve: async (url, ctx) => {
      const extracted = await plugin.extract(url, ctx);
      const infos = Array.isArray(extracted) ? extracted : [extracted];
      const out: ResolvedMedia[] = [];
      for (const info of infos) {
        if (plugin.download) {
          const got = await plugin.download(info, ctx);
          out.push(...(Array.isArray(got) ? got : [got]));
          continue;
        }
        const { mediaInfoToResolved } = await import("./pluginDownload");
        const got = await mediaInfoToResolved(plugin.id as ProviderId, url, info, ctx);
        out.push(...(Array.isArray(got) ? got : [got]));
      }
      return out.length === 1 ? out[0]! : out;
    },
  };

  registerProvider(provider);
  return provider;
}

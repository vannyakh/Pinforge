import type { MediaProvider } from "./types";
import type { ProviderId, ProviderInfo } from "@pinforge/types";
import { ProviderNotFoundError } from "./types";
import { featuresForProvider } from "./capabilities";

const providers: MediaProvider[] = [];

export function registerProvider(provider: MediaProvider): void {
  const idx = providers.findIndex((p) => p.id === provider.id);
  if (idx >= 0) providers[idx] = provider;
  else providers.push(provider);
}

export function listProviders(): ProviderInfo[] {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    status: p.live ? "live" : "stub",
    formats: p.formats,
    modes: p.modes,
    features: p.features ?? (p.live ? featuresForProvider(p.id) : undefined),
  }));
}

export function getProvider(id: ProviderId): MediaProvider | undefined {
  return providers.find((p) => p.id === id);
}

export function detectProvider(url: string): MediaProvider {
  const hit = providers.find((p) => {
    try {
      return p.match(url);
    } catch {
      return false;
    }
  });
  if (!hit) throw new ProviderNotFoundError(url);
  return hit;
}

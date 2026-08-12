/**
 * Desktop adapter — reads electron-store, delegates pure logic to `@pinforge/api`.
 */
import { listProviders } from "@pinforge/core/providers";
import {
  DEFAULT_PROVIDER_PREFS,
  applyProviderEnabled,
  buildInstalledViews as buildInstalledViewsPure,
  buildRegistryList as buildRegistryListPure,
  isBuiltinId as isBuiltinIdPure,
  isProviderEnabled as isProviderEnabledPure,
  normalizeProviderPrefs,
  resolveProviderForUrl as resolveProviderForUrlPure,
  ProviderDisabledError,
  type CustomProviderConfig,
  type InstalledProviderView,
  type ProviderPrefs,
  type RegistryListItem,
  type ResolvedProviderHit,
} from "@pinforge/api/providers";
import { getStore } from "./store";

export { ProviderDisabledError };
export type { ResolvedProviderHit };

export function getProviderPrefs(): ProviderPrefs {
  return normalizeProviderPrefs(getStore().get("providerPrefs"));
}

export function isBuiltinId(id: string): boolean {
  return isBuiltinIdPure(id);
}

export function isProviderEnabled(id: string): boolean {
  return isProviderEnabledPure(id, getProviderPrefs(), getStore().get("customProviders") ?? []);
}

/**
 * Resolve URL → provider, respecting enable/disable prefs and custom host overlays.
 */
export function resolveProviderForUrl(url: string): ResolvedProviderHit | null {
  return resolveProviderForUrlPure(
    url,
    getProviderPrefs(),
    getStore().get("customProviders") ?? []
  );
}

export function setProviderEnabled(id: string, enabled: boolean): void {
  const store = getStore();
  const { prefs, customs } = applyProviderEnabled(
    id,
    enabled,
    getProviderPrefs(),
    store.get("customProviders") ?? []
  );
  store.set("providerPrefs", prefs);
  store.set("customProviders", customs);
}

export function buildRegistryList(): RegistryListItem[] {
  return buildRegistryListPure(getStore().get("customProviders") ?? []);
}

export function buildInstalledViews(
  coreProviders: ReturnType<typeof listProviders>
): InstalledProviderView[] {
  return buildInstalledViewsPure(
    coreProviders,
    getProviderPrefs(),
    getStore().get("customProviders") ?? []
  );
}

export type { ProviderPrefs, CustomProviderConfig, InstalledProviderView, RegistryListItem };
export { DEFAULT_PROVIDER_PREFS };

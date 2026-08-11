import { detectProvider, listProviders } from "@pinforge/providers";
import {
  BUILTIN_PROVIDER_META,
  PROVIDER_REGISTRY,
  compareVersions,
  hostListMatches,
  DEFAULT_PROVIDER_PREFS,
  type CustomProviderConfig,
  type InstalledProviderView,
  type ProviderLifecycle,
  type ProviderPrefs,
  type RegistryListItem,
} from "./types";

export class ProviderDisabledError extends Error {
  readonly providerId: string;
  readonly providerLabel: string;

  constructor(id: string, label: string) {
    super(`${label} is disabled in Settings`);
    this.name = "ProviderDisabledError";
    this.providerId = id;
    this.providerLabel = label;
  }
}

export type ResolvedProviderHit = {
  id: string;
  label: string;
  live: boolean;
  formats: string[];
  modes: string[];
  config?: CustomProviderConfig;
};

export type CoreProviderInfo = ReturnType<typeof listProviders>[number];

export function normalizeProviderPrefs(prefs?: ProviderPrefs | null): ProviderPrefs {
  return {
    disabledBuiltinIds: Array.isArray(prefs?.disabledBuiltinIds)
      ? [...prefs.disabledBuiltinIds]
      : [...DEFAULT_PROVIDER_PREFS.disabledBuiltinIds],
  };
}

export function isBuiltinId(id: string, coreProviders?: CoreProviderInfo[]): boolean {
  const cores = coreProviders ?? listProviders();
  return Boolean(BUILTIN_PROVIDER_META[id]) || cores.some((p) => p.id === id);
}

export function isProviderEnabled(
  id: string,
  prefs: ProviderPrefs,
  customs: CustomProviderConfig[],
  coreProviders?: CoreProviderInfo[]
): boolean {
  const normalized = normalizeProviderPrefs(prefs);
  if (normalized.disabledBuiltinIds.includes(id)) return false;
  const custom = customs.find((p) => p.id === id);
  if (custom && custom.enabled === false) return false;
  if (isBuiltinId(id, coreProviders) && !custom) return true;
  if (custom) return custom.enabled !== false;
  return true;
}

/**
 * Resolve URL → provider, respecting enable/disable prefs and custom host overlays.
 * Pure — callers inject prefs/customs (no electron-store).
 */
export function resolveProviderForUrl(
  url: string,
  prefs: ProviderPrefs = DEFAULT_PROVIDER_PREFS,
  customs: CustomProviderConfig[] = []
): ResolvedProviderHit | null {
  const normalized = normalizeProviderPrefs(prefs);
  const cores = listProviders();

  try {
    const core = detectProvider(url);
    const cfg = customs.find((p) => p.id === core.id);
    if (!isProviderEnabled(core.id, normalized, customs, cores)) {
      throw new ProviderDisabledError(core.id, cfg?.label || core.label);
    }
    return {
      id: core.id,
      label: cfg?.label || core.label,
      live: core.live,
      formats: (core.formats ?? []).map(String),
      modes: (core.modes ?? ["single"]).map(String),
      config: cfg,
    };
  } catch (err) {
    if (err instanceof ProviderDisabledError) throw err;
  }

  for (const cfg of customs) {
    if (!cfg.enabled) continue;
    if (!cfg.hosts?.trim()) continue;
    if (!hostListMatches(cfg.hosts, url)) continue;
    if (isBuiltinId(cfg.id, cores) && normalized.disabledBuiltinIds.includes(cfg.id)) {
      throw new ProviderDisabledError(cfg.id, cfg.label);
    }
    return {
      id: cfg.id,
      label: cfg.label,
      live: false,
      formats: cfg.manifest?.formats?.map(String) ?? ["best"],
      modes: ["single"],
      config: cfg,
    };
  }

  return null;
}

/** Build next prefs + customs when toggling a provider (store writes stay in the app). */
export function applyProviderEnabled(
  id: string,
  enabled: boolean,
  prefs: ProviderPrefs,
  customs: CustomProviderConfig[],
  coreProviders?: CoreProviderInfo[]
): { prefs: ProviderPrefs; customs: CustomProviderConfig[] } {
  const cores = coreProviders ?? listProviders();
  const normalized = normalizeProviderPrefs(prefs);
  const disabled = new Set(normalized.disabledBuiltinIds);
  let nextCustoms = [...customs];

  if (isBuiltinId(id, cores)) {
    if (enabled) disabled.delete(id);
    else disabled.add(id);
  }

  const idx = nextCustoms.findIndex((p) => p.id === id);
  if (idx >= 0) {
    nextCustoms[idx] = { ...nextCustoms[idx]!, enabled, updatedAt: Date.now() };
  } else if (isBuiltinId(id, cores)) {
    const meta = BUILTIN_PROVIDER_META[id];
    const core = cores.find((p) => p.id === id);
    nextCustoms.push({
      id,
      label: core?.label ?? id,
      enabled,
      hosts: meta?.hosts ?? "",
      notes: meta?.description ?? "",
      engine: meta?.engine ?? "builtin",
      capabilities: meta?.capabilities ?? [],
      origin: "builtin-override",
      builtin: true,
      installedVersion: meta?.version,
      version: meta?.version,
      formatPlugins: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  return {
    prefs: { disabledBuiltinIds: [...disabled] },
    customs: nextCustoms,
  };
}

export function buildRegistryList(customs: CustomProviderConfig[]): RegistryListItem[] {
  const byId = new Map(customs.map((p) => [p.id, p]));
  return PROVIDER_REGISTRY.map((item) => {
    const cfg = byId.get(item.id);
    const installedVersion = cfg?.installedVersion || cfg?.version;
    const updateAvailable = Boolean(
      installedVersion && compareVersions(item.version, installedVersion) > 0
    );
    return {
      ...item,
      installed: Boolean(cfg),
      installedVersion,
      updateAvailable,
    };
  });
}

export function buildInstalledViews(
  coreProviders: CoreProviderInfo[],
  prefs: ProviderPrefs,
  customs: CustomProviderConfig[]
): InstalledProviderView[] {
  const normalized = normalizeProviderPrefs(prefs);
  const catalog = new Map(PROVIDER_REGISTRY.map((r) => [r.id, r]));
  const views: InstalledProviderView[] = [];

  for (const p of coreProviders) {
    const meta = BUILTIN_PROVIDER_META[p.id];
    const cfg = customs.find((c) => c.id === p.id);
    const enabled = !normalized.disabledBuiltinIds.includes(p.id) && (cfg?.enabled ?? true);
    const catalogItem = catalog.get(p.id);
    const version = cfg?.installedVersion || cfg?.version || meta?.version;
    const updateAvailable = Boolean(
      catalogItem && version && compareVersions(catalogItem.version, version) > 0
    );
    let lifecycle: ProviderLifecycle = enabled ? "enabled" : "disabled";
    if (updateAvailable) lifecycle = "updateAvailable";
    views.push({
      id: p.id,
      label: p.label,
      hosts: cfg?.hosts || meta?.hosts || "",
      origin: "builtin",
      lifecycle,
      enabled,
      version,
      capabilities: cfg?.capabilities || meta?.capabilities || [],
      checksum: cfg?.checksum,
      builtin: true,
      live: p.status === "live",
      sourcePath: cfg?.sourcePath,
      updateAvailable,
    });
  }

  for (const cfg of customs) {
    if (coreProviders.some((p) => p.id === cfg.id)) continue;
    const catalogItem = catalog.get(cfg.id);
    const version = cfg.installedVersion || cfg.version;
    const updateAvailable = Boolean(
      catalogItem && version && compareVersions(catalogItem.version, version) > 0
    );
    let lifecycle: ProviderLifecycle;
    if (!cfg.enabled) lifecycle = "disabled";
    else if (updateAvailable) lifecycle = "updateAvailable";
    else lifecycle = "enabled";

    views.push({
      id: cfg.id,
      label: cfg.label,
      hosts: cfg.hosts,
      origin: cfg.origin ?? (cfg.sourceUrl?.startsWith("registry://") ? "registry" : "local"),
      lifecycle,
      enabled: cfg.enabled,
      version,
      capabilities:
        cfg.capabilities || cfg.manifest?.capabilities || catalogItem?.capabilities || [],
      checksum: cfg.checksum || cfg.manifest?.checksum,
      builtin: false,
      live: false,
      sourcePath: cfg.sourcePath,
      updateAvailable,
    });
  }

  return views;
}

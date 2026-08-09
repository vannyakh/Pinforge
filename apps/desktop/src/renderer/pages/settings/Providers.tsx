import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Message, Switch, Tabs, Tag } from "@arco-design/web-react";
import { Plus, Right, Search } from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@renderer/hooks/context/AppContext";
import {
  api,
  type InstalledProviderView,
  type RegistryListItem,
} from "@renderer/api";
import {
  BUILTIN_PROVIDER_META,
  CAPABILITY_LABELS,
  type ProviderCapability,
} from "@common/providers/types";
import { PROVIDER_LOGOS } from "./providerLogos";

const ProviderLogo: React.FC<{ id: string; label: string }> = ({ id, label }) => {
  const logo = PROVIDER_LOGOS[id];
  if (logo) {
    return <img className="provider-logo" src={logo.src} alt={logo.alt} draggable={false} />;
  }
  return (
    <span className="provider-logo provider-logo--fallback" aria-hidden>
      {(label[0] ?? "?").toUpperCase()}
    </span>
  );
};

const CapBadges: React.FC<{ caps: string[] }> = ({ caps }) => {
  if (!caps.length) return null;
  return (
    <div className="flex flex-wrap gap-4px mt-4px">
      {caps.slice(0, 4).map((c) => (
        <Tag key={c} size="small" color="gray">
          {CAPABILITY_LABELS[c as ProviderCapability] ?? c}
        </Tag>
      ))}
      {caps.length > 4 && (
        <Tag size="small" color="gray">
          +{caps.length - 4}
        </Tag>
      )}
    </div>
  );
};

const ProvidersSettings: React.FC = () => {
  const { settings, refresh } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("builtin");
  const [installed, setInstalled] = useState<InstalledProviderView[]>([]);
  const [registry, setRegistry] = useState<RegistryListItem[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const [inst, reg] = await Promise.all([
      api.listInstalledProviders(),
      api.registryList(),
    ]);
    setInstalled(inst);
    setRegistry(reg);
  }, []);

  useEffect(() => {
    reload().catch((e) => Message.error(e instanceof Error ? e.message : String(e)));
  }, [reload]);

  const builtins = useMemo(
    () => installed.filter((p) => p.builtin || p.origin === "builtin"),
    [installed]
  );
  const added = useMemo(
    () => installed.filter((p) => !p.builtin && p.origin !== "builtin"),
    [installed]
  );
  const readyCount = useMemo(
    () => builtins.filter((p) => p.live && p.enabled).length,
    [builtins]
  );

  const registryFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return registry;
    return registry.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.hosts.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
    );
  }, [registry, search]);

  if (!settings) return null;

  const openDetail = (id: string) => {
    void navigate(`/settings/providers/${encodeURIComponent(id)}`);
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    setSaving(true);
    try {
      const res = await api.setProviderEnabled(id, enabled);
      setInstalled(res.installed);
      await refresh();
      Message.success(enabled ? "Provider enabled" : "Provider disabled");
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadSource = async () => {
    const path = await api.pickProviderSource();
    if (!path) return;
    setSaving(true);
    try {
      const { provider } = await api.installProviderFromSource(path);
      Message.success(`Installed “${provider.label}” from package.`);
      await reload();
      openDetail(provider.id);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const installFromRegistry = async (id: string) => {
    setSaving(true);
    try {
      const res = await api.installFromRegistry(id);
      setRegistry(res.registry);
      await reload();
      Message.success(`${res.provider.label} installed from registry.`);
      openDetail(id);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const uninstall = async (id: string) => {
    setSaving(true);
    try {
      const res = await api.uninstallProvider(id);
      setRegistry(res.registry);
      setInstalled(res.installed);
      Message.success("Provider uninstalled");
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const renderBuiltinRow = (item: InstalledProviderView) => (
    <div key={item.id} className="provider-row provider-row--clickable">
      <button type="button" className="provider-row__main" onClick={() => openDetail(item.id)}>
        <ProviderLogo id={item.id} label={item.label} />
        <div className="min-w-0 text-left">
          <div className="text-14px font-500 text-t-primary truncate">{item.label}</div>
          <div className="text-12px text-t-tertiary mt-2px truncate">
            {item.hosts || BUILTIN_PROVIDER_META[item.id]?.hosts || "Open to configure"}
            {item.version ? ` · v${item.version}` : ""}
          </div>
          <CapBadges caps={item.capabilities} />
        </div>
      </button>
      <div className="flex items-center gap-8px shrink-0" onClick={(e) => e.stopPropagation()}>
        {item.updateAvailable && (
          <Tag size="small" color="orangered">
            Update
          </Tag>
        )}
        <Tag color={item.live ? (item.enabled ? "green" : "gray") : "orangered"} size="small">
          {!item.live ? "Coming soon" : item.enabled ? "Available" : "Disabled"}
        </Tag>
        {item.live && (
          <Switch
            size="small"
            checked={item.enabled}
            disabled={saving}
            onChange={(v) => void toggleEnabled(item.id, v)}
          />
        )}
        <button type="button" className="provider-row__chevron" onClick={() => openDetail(item.id)}>
          <Right theme="outline" size="16" fill="currentColor" />
        </button>
      </div>
    </div>
  );

  const renderInstalledRow = (item: InstalledProviderView) => (
    <div key={item.id} className="provider-row">
      <button type="button" className="provider-row__main" onClick={() => openDetail(item.id)}>
        <ProviderLogo id={item.id} label={item.label} />
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-8px flex-wrap">
            <span className="text-14px font-500 text-t-primary truncate">{item.label}</span>
            <Tag size="small" color="gray">
              {item.origin}
            </Tag>
            {item.updateAvailable && (
              <Tag size="small" color="orangered">
                Update
              </Tag>
            )}
          </div>
          <div className="text-12px text-t-tertiary mt-2px truncate">
            {item.hosts || "No hosts"}
            {item.version ? ` · v${item.version}` : ""}
          </div>
          <CapBadges caps={item.capabilities} />
        </div>
      </button>
      <div className="flex items-center gap-8px shrink-0">
        <Switch
          size="small"
          checked={item.enabled}
          disabled={saving}
          onChange={(v) => void toggleEnabled(item.id, v)}
        />
        <Button size="mini" status="danger" disabled={saving} onClick={() => void uninstall(item.id)}>
          Uninstall
        </Button>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-16px mb-6px w-full">
        <div className="flex items-center gap-10px min-w-0">
          <div className="text-22px font-600 text-t-primary">Providers</div>
          <Tag color="green" size="small" className="shrink-0">
            {readyCount} ready
          </Tag>
        </div>
        <div className="flex items-center gap-8px">
          <Button loading={saving} onClick={() => void uploadSource()}>
            Install package
          </Button>
          <Button
            type="primary"
            loading={saving}
            icon={<Plus theme="outline" size="14" />}
            onClick={() => setTab("registry")}
          >
            Browse registry
          </Button>
        </div>
      </div>
      <div className="text-t-secondary text-14px mb-18px">
        Built-in extractors ship with the app. Registry and local packages install separately and can
        be enabled, updated, or removed.
      </div>

      <div className="max-w-720px mx-auto w-full">
        <Tabs activeTab={tab} onChange={setTab}>
          <Tabs.TabPane key="builtin" title={`Built-in (${builtins.length})`}>
            <div className="provider-list flex flex-col gap-10px pt-12px">
              {builtins.map(renderBuiltinRow)}
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane key="installed" title={`Installed (${added.length})`}>
            <div className="provider-list flex flex-col gap-10px pt-12px">
              {added.length === 0 ? (
                <div className="text-13px text-t-tertiary py-24px text-center">
                  No registry or local packages yet. Browse the registry or install a ZIP.
                </div>
              ) : (
                added.map(renderInstalledRow)
              )}
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane key="registry" title="Registry">
            <div className="pt-12px flex flex-col gap-12px">
              <Input
                allowClear
                prefix={<Search theme="outline" size="14" />}
                placeholder="Search providers…"
                value={search}
                onChange={setSearch}
              />
              <div className="provider-list flex flex-col gap-10px h-auto">
                {registryFiltered.map((item) => (
                  <div key={item.id} className="provider-row">
                    <div className="provider-row__main">
                      <ProviderLogo id={item.id} label={item.label} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-8px flex-wrap">
                          <span className="text-14px font-500 text-t-primary">{item.label}</span>
                          <Tag
                            size="small"
                            color={item.status === "official" ? "arcoblue" : "gray"}
                          >
                            {item.status}
                          </Tag>
                          {item.verified && (
                            <Tag size="small" color="green">
                              verified
                            </Tag>
                          )}
                          {item.updateAvailable && (
                            <Tag size="small" color="orangered">
                              Update
                            </Tag>
                          )}
                        </div>
                        <div className="text-12px text-t-tertiary mt-2px">{item.description}</div>
                        <div className="text-11px text-t-tertiary mt-2px tabular-nums">
                          v{item.version}
                          {item.installedVersion ? ` · installed ${item.installedVersion}` : ""}
                        </div>
                        <CapBadges caps={item.capabilities} />
                      </div>
                    </div>
                    <Button
                      size="small"
                      type={item.installed ? "secondary" : "primary"}
                      disabled={saving || (item.installed && !item.updateAvailable)}
                      onClick={() => void installFromRegistry(item.id)}
                    >
                      {item.installed
                        ? item.updateAvailable
                          ? "Update"
                          : "Installed"
                        : "Install"}
                    </Button>
                  </div>
                ))}
                {registryFiltered.length === 0 && (
                  <div className="text-13px text-t-tertiary py-16px text-center">
                    No providers match “{search}”.
                  </div>
                )}
              </div>
            </div>
          </Tabs.TabPane>
        </Tabs>
      </div>
    </div>
  );
};

export default ProvidersSettings;

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Dropdown, Menu, Message, Modal, Tag } from "@arco-design/web-react";
import { Down, Plus, Right } from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@renderer/hooks/context/AppContext";
import { api, type CustomProviderConfig } from "@renderer/api";
import { BUILTIN_PROVIDER_META, PROVIDER_REGISTRY } from "@common/providers/types";
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

function metaHosts(id: string): string {
  const meta = BUILTIN_PROVIDER_META[id] ?? PROVIDER_REGISTRY.find((r) => r.id === id);
  return meta?.hosts ?? "";
}

const ProvidersSettings: React.FC = () => {
  const { settings } = useApp();
  const navigate = useNavigate();
  const [custom, setCustom] = useState<CustomProviderConfig[]>([]);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadCustom = useCallback(async () => {
    setCustom(await api.listCustomProviders());
  }, []);

  useEffect(() => {
    loadCustom().catch((e) => Message.error(e instanceof Error ? e.message : String(e)));
  }, [loadCustom]);

  const configById = useMemo(() => {
    const map = new Map<string, CustomProviderConfig>();
    for (const c of custom) map.set(c.id, c);
    return map;
  }, [custom]);

  const installedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of settings?.providers ?? []) {
      if (p.status === "live") ids.add(p.id);
    }
    for (const p of custom) ids.add(p.id);
    return ids;
  }, [settings?.providers, custom]);

  if (!settings) return null;

  const live = settings.providers.filter((p) => p.status === "live").length;
  const added = custom.filter((c) => !c.builtin && !settings.providers.some((p) => p.id === c.id));

  const openDetail = (id: string) => {
    void navigate(`/settings/providers/${encodeURIComponent(id)}`);
  };

  const uploadSource = async () => {
    const path = await api.pickProviderSource();
    if (!path) return;
    setSaving(true);
    try {
      const { provider } = await api.installProviderFromSource(path);
      Message.success(`Installed “${provider.label}” from package.`);
      openDetail(provider.id);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const installFromRegistry = async (item: (typeof PROVIDER_REGISTRY)[number]) => {
    setSaving(true);
    try {
      await api.upsertCustomProvider({
        id: item.id,
        label: item.label,
        enabled: false,
        hosts: item.hosts,
        notes: item.description,
        sourceUrl: `registry://${item.id}`,
        engine: item.engine ?? "http-meta",
        formatPlugins: [],
        createdAt: Date.now(),
      });
      setRegistryOpen(false);
      Message.success(`${item.label} added.`);
      openDetail(item.id);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const actionMenu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === "registry") setRegistryOpen(true);
        else if (key === "upload") void uploadSource();
        else if (key === "add") openDetail("new");
      }}
    >
      <Menu.Item key="registry">Browse registry</Menu.Item>
      <Menu.Item key="upload" disabled={saving}>
        Upload extension
      </Menu.Item>
      <Menu.Item key="add">Add provider</Menu.Item>
    </Menu>
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-16px mb-6px w-full">
        <div className="flex items-center gap-10px min-w-0">
          <div className="text-22px font-600 text-t-primary">Providers</div>
          <Tag color="green" size="small" className="shrink-0">
            {live} ready
          </Tag>
        </div>
        <Dropdown droplist={actionMenu} position="br" trigger="click">
          <Button type="primary" loading={saving} icon={<Plus theme="outline" size="14" />}>
            Add
            <Down theme="outline" size="12" className="ml-4px" />
          </Button>
        </Dropdown>
      </div>
      <div className="text-t-secondary text-14px mb-18px">
        Open a provider to configure it, or use Add to install from registry or a package.
      </div>

      <div className="max-w-720px mx-auto w-full">
      <div className="text-12px font-500 text-t-tertiary tracking-wide uppercase mb-8px">
        Built-in
      </div>
      <div className="provider-list flex flex-col gap-10px mb-24px">
        {settings.providers.map((item) => {
          const cfg = configById.get(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className="provider-row provider-row--clickable"
              onClick={() => openDetail(item.id)}
            >
              <div className="provider-row__main">
                <ProviderLogo id={item.id} label={item.label} />
                <div className="min-w-0 text-left">
                  <div className="text-14px font-500 text-t-primary truncate">{item.label}</div>
                  <div className="text-12px text-t-tertiary mt-2px truncate">
                    {cfg?.hosts || metaHosts(item.id) || "Open to configure"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-8px shrink-0">
                <Tag color={item.status === "live" ? "green" : "orangered"} size="small">
                  {item.status === "live" ? "Available" : "Coming soon"}
                </Tag>
                <Right theme="outline" size="16" fill="currentColor" />
              </div>
            </button>
          );
        })}
      </div>

      {added.length > 0 && (
        <>
          <div className="text-12px font-500 text-t-tertiary tracking-wide uppercase mb-8px">
            Added
          </div>
          <div className="provider-list flex flex-col gap-10px">
            {added.map((item) => (
              <button
                key={item.id}
                type="button"
                className="provider-row provider-row--clickable"
                onClick={() => openDetail(item.id)}
              >
                <div className="provider-row__main">
                  <ProviderLogo id={item.id} label={item.label} />
                  <div className="min-w-0 text-left">
                    <div className="text-14px font-500 text-t-primary truncate">{item.label}</div>
                    <div className="text-12px text-t-tertiary mt-2px truncate">
                      {item.hosts || "No hosts set"}
                      {item.engine ? ` · ${item.engine}` : ""}
                      {item.sourcePath ? " · extension" : ""}
                      {item.sourceUrl?.startsWith("registry://") ? " · registry" : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-8px shrink-0">
                  <Tag color={item.enabled ? "green" : "gray"} size="small">
                    {item.enabled ? "Enabled" : "Disabled"}
                  </Tag>
                  <Right theme="outline" size="16" fill="currentColor" />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      </div>

      <Modal
        title="Provider registry"
        visible={registryOpen}
        onCancel={() => setRegistryOpen(false)}
        footer={null}
        style={{ width: 560 }}
      >
        <div className="text-13px text-t-secondary mb-14px">
          Add a provider, then open its page to finish configuration.
        </div>
        <div className="flex flex-col gap-10px max-h-420px overflow-y-auto">
          {PROVIDER_REGISTRY.map((item) => {
            const installed = installedIds.has(item.id);
            return (
              <div key={item.id} className="provider-row">
                <div className="provider-row__main">
                  <ProviderLogo id={item.id} label={item.label} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-8px">
                      <span className="text-14px font-500 text-t-primary">{item.label}</span>
                      <Tag size="small" color={item.status === "official" ? "arcoblue" : "gray"}>
                        {item.status}
                      </Tag>
                    </div>
                    <div className="text-12px text-t-tertiary mt-2px">{item.description}</div>
                  </div>
                </div>
                <Button
                  size="small"
                  type={installed ? "secondary" : "primary"}
                  disabled={installed || saving}
                  onClick={() => void installFromRegistry(item)}
                >
                  {installed ? "Added" : "Add"}
                </Button>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
};

export default ProvidersSettings;

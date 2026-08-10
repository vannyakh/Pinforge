import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Button, Dropdown, Input, Menu, Message, Switch, Tag, Tooltip } from "@arco-design/web-react";
import { Down, Plus, Search } from "@icon-park/react";
import classNames from "classnames";
import { useNavigate } from "react-router-dom";
import { useApp } from "@renderer/hooks/context/AppContext";
import {
  api,
  type InstalledProviderView,
  type RegistryListItem,
} from "@renderer/api";
import { PROVIDER_LOGOS } from "./providerLogos";

type TabKey = "builtin" | "installed" | "registry";

const ProviderLogo: React.FC<{ id: string; label: string }> = ({ id, label }) => {
  const logo = PROVIDER_LOGOS[id];
  return (
    <Avatar
      size={32}
      shape="square"
      style={{
        flexShrink: 0,
        backgroundColor: logo ? "transparent" : "var(--color-fill-2, var(--bg-3))",
      }}
    >
      {logo ? (
        <img src={logo.src} alt={logo.alt} className="provider-logo" draggable={false} />
      ) : (
        <span className="provider-logo-fallback">{(label[0] ?? "?").toUpperCase()}</span>
      )}
    </Avatar>
  );
};

const statusTag = (
  item: InstalledProviderView
): { color: "green" | "red" | "orangered" | "gray"; label: string } => {
  if (item.updateAvailable) return { color: "orangered", label: "Update" };
  if (!item.live) return { color: "red", label: "Coming soon" };
  if (item.enabled) return { color: "green", label: "Available" };
  return { color: "gray", label: "Disabled" };
};

const ProvidersSettings: React.FC = () => {
  const { settings, refresh } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("builtin");
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

  const stop = (event: React.MouseEvent) => event.stopPropagation();

  const renderInstalledRow = (item: InstalledProviderView, opts?: { showUninstall?: boolean }) => {
    const status = statusTag(item);
    const disabledLook = item.live && !item.enabled;
    return (
      <div
        key={item.id}
        className={classNames("provider-row", disabledLook && "provider-row--dim")}
        onClick={() => openDetail(item.id)}
      >
        <div className="provider-row__main">
          <ProviderLogo id={item.id} label={item.label} />
          <div className="provider-row__meta">
            <span className="provider-row__name">{item.label}</span>
            <Tag size="small" color={status.color} className="provider-row__tag">
              {status.label}
            </Tag>
            {!item.builtin && item.origin !== "builtin" && (
              <Tag size="small" color="gray" className="provider-row__tag">
                {item.origin}
              </Tag>
            )}
            {item.hosts ? (
              <Tooltip content={item.hosts}>
                <span className="provider-row__info" aria-label="Hosts">
                  ⓘ
                </span>
              </Tooltip>
            ) : null}
          </div>
        </div>
        <div className="provider-row__actions" onClick={stop}>
          {item.live && (
            <Switch
              size="small"
              checked={item.enabled}
              disabled={saving}
              onChange={(v) => void toggleEnabled(item.id, v)}
            />
          )}
          {opts?.showUninstall && (
            <Button
              size="small"
              type="outline"
              status="danger"
              disabled={saving}
              className="provider-row__btn"
              onClick={() => void uninstall(item.id)}
            >
              Uninstall
            </Button>
          )}
          <Button
            size="small"
            type="outline"
            className="provider-row__btn"
            onClick={() => openDetail(item.id)}
          >
            Edit
          </Button>
        </div>
      </div>
    );
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "builtin", label: "Built-in", count: builtins.length },
    { key: "installed", label: "Installed", count: added.length },
    { key: "registry", label: "Registry", count: registry.length },
  ];

  const addMenu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === "package") void uploadSource();
        if (key === "registry") setTab("registry");
      }}
    >
      <Menu.Item key="registry">
        <span className="inline-flex items-center gap-8px">
          <Plus theme="outline" size="14" />
          Browse registry
        </span>
      </Menu.Item>
      <Menu.Item key="package">Install package…</Menu.Item>
    </Menu>
  );

  return (
    <div className="providers-page">
      <div className="providers-page__chrome">
        <div className="providers-page__header">
          <h1 className="providers-page__title">Providers</h1>
          <div className="providers-page__actions">
            {tab === "registry" && (
              <Input
                allowClear
                className="providers-page__search"
                prefix={<Search theme="outline" size="14" />}
                placeholder="Search providers…"
                value={search}
                onChange={setSearch}
              />
            )}
            <Dropdown droplist={addMenu} position="br" trigger="click">
              <Button className="providers-page__add-btn" loading={saving}>
                Add provider
                <Down theme="outline" size="14" />
              </Button>
            </Dropdown>
          </div>
        </div>
        <p className="providers-page__desc">
          Manage built-in and installed download providers. Enable the ones you use, install more
          from the registry, or add a local package.
        </p>

        <div className="providers-page__tabs" role="tablist">
          {tabs.map((item) => {
            const active = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={classNames(
                  "providers-page__tab",
                  active && "providers-page__tab--active"
                )}
                onClick={() => setTab(item.key)}
              >
                <span>{item.label}</span>
                <span className="providers-page__tab-count">{item.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="providers-page__body">
        <div className="providers-page__panel">
          {tab === "builtin" &&
            (builtins.length > 0 ? (
              builtins.map((item) => renderInstalledRow(item))
            ) : (
              <div className="providers-page__empty">No built-in providers.</div>
            ))}

          {tab === "installed" &&
            (added.length > 0 ? (
              added.map((item) => renderInstalledRow(item, { showUninstall: true }))
            ) : (
              <div className="providers-page__empty">
                No registry or local packages yet. Use Add provider to browse the registry or
                install a ZIP.
              </div>
            ))}

          {tab === "registry" &&
            (registryFiltered.length > 0 ? (
              registryFiltered.map((item) => (
                <div
                  key={item.id}
                  className="provider-row"
                  onClick={() => {
                    if (item.installed) openDetail(item.id);
                  }}
                  style={{ cursor: item.installed ? "pointer" : "default" }}
                >
                  <div className="provider-row__main">
                    <ProviderLogo id={item.id} label={item.label} />
                    <div className="provider-row__meta">
                      <span className="provider-row__name">{item.label}</span>
                      <Tag
                        size="small"
                        color={
                          item.installed
                            ? item.updateAvailable
                              ? "orangered"
                              : "green"
                            : "red"
                        }
                        className="provider-row__tag"
                      >
                        {item.installed
                          ? item.updateAvailable
                            ? "Update"
                            : "Installed"
                          : "Not installed"}
                      </Tag>
                      {item.status === "official" && (
                        <Tag size="small" color="gray" className="provider-row__tag">
                          official
                        </Tag>
                      )}
                      {item.description ? (
                        <Tooltip content={item.description}>
                          <span className="provider-row__info" aria-label="Description">
                            ⓘ
                          </span>
                        </Tooltip>
                      ) : null}
                    </div>
                  </div>
                  <div className="provider-row__actions" onClick={stop}>
                    <Button
                      size="small"
                      type="outline"
                      className="provider-row__btn"
                      disabled={saving || (item.installed && !item.updateAvailable)}
                      onClick={() => void installFromRegistry(item.id)}
                    >
                      {item.installed
                        ? item.updateAvailable
                          ? "Update"
                          : "Installed"
                        : "Install"}
                    </Button>
                    {item.installed && (
                      <Button
                        size="small"
                        type="outline"
                        className="provider-row__btn"
                        onClick={() => openDetail(item.id)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="providers-page__empty">
                {search.trim()
                  ? `No providers match “${search.trim()}”.`
                  : "Registry is empty."}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default ProvidersSettings;

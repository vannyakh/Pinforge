import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Message, Select, Switch, Tag } from "@arco-design/web-react";
import { FileCode, FolderOpen, Info, Left, Upload } from "@icon-park/react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "@renderer/hooks/context/AppContext";
import {
  api,
  type CustomProviderConfig,
  type FormatPluginConfig,
  type ProviderManifest,
} from "@renderer/api";
import {
  BUILTIN_PROVIDER_META,
  CAPABILITY_LABELS,
  PROVIDER_ENGINES,
  PROVIDER_REGISTRY,
  type ProviderCapability,
  type ProviderEngineId,
} from "@common/providers/types";
import { PROVIDER_LOGOS, slugifyProviderId } from "./providerLogos";

const ProviderLogo: React.FC<{ id: string; label: string; size?: number }> = ({
  id,
  label,
  size = 40,
}) => {
  const logo = PROVIDER_LOGOS[id];
  if (logo) {
    return (
      <img
        src={logo.src}
        alt={logo.alt}
        draggable={false}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }
  return (
    <span
      className="provider-logo provider-logo--fallback"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {(label[0] ?? "?").toUpperCase()}
    </span>
  );
};

function fileLeaf(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

type FormState = {
  id: string;
  label: string;
  enabled: boolean;
  hosts: string;
  notes: string;
  sourcePath: string;
  manifestPath: string;
  manifest: ProviderManifest | null;
  sourceUrl: string;
  extractorUrl: string;
  format: string;
  engine: ProviderEngineId;
  formatPlugins: FormatPluginConfig[];
  version: string;
  builtin: boolean;
  createdAt?: number;
  removable: boolean;
  live: boolean;
  description: string;
  formats: string[];
  capabilities: string[];
  origin?: string;
  checksum?: string;
};

function metaFor(id: string) {
  return BUILTIN_PROVIDER_META[id] ?? PROVIDER_REGISTRY.find((r) => r.id === id) ?? null;
}

function defaultEngine(id: string, cfg?: CustomProviderConfig | null): ProviderEngineId {
  if (cfg?.engine && PROVIDER_ENGINES.some((e) => e.id === cfg.engine)) {
    return cfg.engine as ProviderEngineId;
  }
  const meta = metaFor(id);
  if (meta && "engine" in meta && meta.engine) return meta.engine;
  if (id === "youtube") return "piped";
  if (id === "pinterest") return "builtin";
  return "http-meta";
}

const Section: React.FC<{
  title: string;
  badge?: { text: string; tone: "now" | "later" };
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, badge, action, children }) => (
  <section className="provider-detail-card">
    <div className="provider-detail-card__head">
      <div className="flex items-center gap-8px min-w-0">
        <h3 className="provider-detail-card__title">{title}</h3>
        {badge && (
          <Tag size="small" color={badge.tone === "now" ? "green" : "orangered"}>
            {badge.text}
          </Tag>
        )}
      </div>
      {action}
    </div>
    <div className="provider-detail-card__body">{children}</div>
  </section>
);

const FieldRow: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="provider-detail-field">
    <div className="provider-detail-field__meta">
      <div className="text-13px text-t-primary">{label}</div>
      {hint && <div className="text-12px text-t-tertiary mt-2px">{hint}</div>}
    </div>
    <div className="provider-detail-field__control">{children}</div>
  </div>
);

const ProviderDetailPage: React.FC = () => {
  const { providerId: rawId } = useParams<{ providerId: string }>();
  const providerId = rawId ? decodeURIComponent(rawId) : "new";
  const isNew = providerId === "new";
  const navigate = useNavigate();
  const { settings, refresh, updateSettings } = useApp();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const builtinProvider = useMemo(
    () => settings?.providers.find((p) => p.id === providerId),
    [settings?.providers, providerId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!settings) return;
      try {
        const customList = await api.listCustomProviders();
        if (cancelled) return;

        if (isNew) {
          setForm({
            id: "",
            label: "",
            enabled: true,
            hosts: "",
            notes: "",
            sourcePath: "",
            manifestPath: "",
            manifest: null,
            sourceUrl: "",
            extractorUrl: "",
            format: "best",
            engine: "script",
            formatPlugins: [],
            version: "0.1.0",
            builtin: false,
            removable: true,
            live: false,
            description: "Add a custom download provider and configure how links are matched.",
            formats: ["best"],
            capabilities: [],
          });
          setLoaded(true);
          return;
        }

        const cfg = customList.find((c) => c.id === providerId);
        const builtin = settings.providers.find((p) => p.id === providerId);
        const meta = metaFor(providerId);
        const prefs = settings.providerPrefs;
        const disabledBuiltin = prefs?.disabledBuiltinIds?.includes(providerId) ?? false;

        if (!cfg && !builtin) {
          Message.error("Provider not found");
          navigate("/settings/providers", { replace: true });
          return;
        }

        const label = cfg?.label || builtin?.label || providerId;
        const description =
          (meta && "description" in meta ? meta.description : "") ||
          (builtin?.status === "live"
            ? "Ready to use — paste a matching link on Home to download."
            : "Configure formats and options for this provider.");
        const hosts = cfg?.hosts || (meta && "hosts" in meta ? meta.hosts : "") || "";
        const formats =
          cfg?.manifest?.formats ||
          builtin?.formats?.map(String) ||
          (meta && "formats" in meta && meta.formats ? meta.formats : []) ||
          [];
        const capabilities =
          cfg?.capabilities ||
          cfg?.manifest?.capabilities ||
          (meta && "capabilities" in meta ? meta.capabilities : []) ||
          [];

        const enabled = builtin
          ? !disabledBuiltin && (cfg?.enabled ?? true)
          : (cfg?.enabled ?? true);

        setForm({
          id: providerId,
          label,
          enabled,
          hosts,
          notes: cfg?.notes ?? "",
          sourcePath: cfg?.sourcePath ?? "",
          manifestPath: cfg?.manifestPath ?? "",
          manifest: cfg?.manifest ?? null,
          sourceUrl: cfg?.sourceUrl ?? "",
          extractorUrl:
            cfg?.extractorUrl ?? (providerId === "youtube" ? settings.extractorUrl : ""),
          format: cfg?.format ?? settings.format ?? "best",
          engine: defaultEngine(providerId, cfg),
          formatPlugins: cfg?.formatPlugins ?? [],
          version:
            cfg?.installedVersion ??
            cfg?.version ??
            cfg?.manifest?.version ??
            (meta && "version" in meta ? meta.version : "") ??
            "",
          builtin: Boolean(builtin) || Boolean(cfg?.builtin),
          createdAt: cfg?.createdAt,
          removable: !builtin || builtin.status === "stub",
          live: builtin?.status === "live",
          description,
          formats,
          capabilities: capabilities.map(String),
          origin: cfg?.origin,
          checksum: cfg?.checksum || cfg?.manifest?.checksum,
        });
        setLoaded(true);
      } catch (e) {
        Message.error(e instanceof Error ? e.message : String(e));
        navigate("/settings/providers", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings, providerId, isNew, navigate]);

  const goBack = () => navigate("/settings/providers");

  const applyManifest = (
    manifest: ProviderManifest,
    paths: { sourcePath: string; manifestPath: string }
  ) => {
    setForm((f) => {
      if (!f) return f;
      const hosts = (manifest.hosts?.length ? manifest.hosts.join(", ") : f.hosts) || f.hosts;
      const engine =
        (manifest.engine && PROVIDER_ENGINES.some((e) => e.id === manifest.engine)
          ? (manifest.engine as ProviderEngineId)
          : f.engine) || f.engine;
      return {
        ...f,
        id: f.builtin || (!isNew && f.id) ? f.id : manifest.id || f.id,
        label: f.builtin ? f.label : manifest.name || f.label,
        notes: manifest.description || f.notes,
        hosts,
        engine,
        format: manifest.formats?.[0] || f.format,
        formats: manifest.formats?.length ? manifest.formats : f.formats,
        version: manifest.version || f.version,
        sourcePath: paths.sourcePath,
        manifestPath: paths.manifestPath,
        manifest,
      };
    });
  };

  const installSource = async () => {
    const path = await api.pickProviderSource();
    if (!path) return;
    setBusy(true);
    try {
      const { provider } = await api.installProviderFromSource(path);
      applyManifest(provider.manifest!, {
        sourcePath: provider.sourcePath ?? path,
        manifestPath: provider.manifestPath ?? "",
      });
      setForm((f) =>
        f
          ? {
              ...f,
              id: f.builtin || (!isNew && f.id) ? f.id : provider.id,
              label: f.builtin ? f.label : provider.label,
              enabled: f.enabled,
              formatPlugins:
                provider.formatPlugins && provider.formatPlugins.length > 0
                  ? provider.formatPlugins
                  : f.formatPlugins,
              version: provider.version ?? f.version,
            }
          : f
      );
      Message.success("Extension package installed.");
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reloadManifest = async () => {
    if (!form?.sourcePath && !form?.manifestPath) {
      Message.warning("Install a source package first.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.readProviderManifest(form.manifestPath || form.sourcePath);
      if (!result) {
        Message.warning("No pinforge.provider.json or manifest.json found.");
        return;
      }
      applyManifest(result.manifest, {
        sourcePath: form.sourcePath,
        manifestPath: result.path,
      });
      Message.success("Manifest reloaded.");
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadPlugin = async () => {
    const path = await api.pickFormatPlugin();
    if (!path) return;
    setBusy(true);
    try {
      const plugin = await api.uploadFormatPlugin(path);
      setForm((f) =>
        f
          ? {
              ...f,
              formatPlugins: [...f.formatPlugins.filter((p) => p.id !== plugin.id), plugin],
            }
          : f
      );
      Message.success(`Format plugin “${plugin.label}” added.`);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!form) return;
    const label = form.label.trim();
    if (!label) {
      Message.warning("Enter a provider name.");
      return;
    }
    const id = (
      form.id.trim() ||
      slugifyProviderId(label) ||
      `provider-${Date.now().toString(36)}`
    ).toLowerCase();

    setSaving(true);
    try {
      const next: CustomProviderConfig = {
        id,
        label,
        enabled: form.enabled,
        hosts: form.hosts.trim(),
        notes: form.notes.trim() || undefined,
        sourcePath: form.sourcePath.trim() || undefined,
        manifestPath: form.manifestPath.trim() || undefined,
        manifest: form.manifest ?? undefined,
        sourceUrl: form.sourceUrl.trim() || undefined,
        extractorUrl: form.extractorUrl.trim() || undefined,
        format: form.format || undefined,
        engine: form.engine,
        formatPlugins: form.formatPlugins,
        version: form.version || form.manifest?.version,
        installedVersion: form.version || form.manifest?.version,
        capabilities: form.capabilities as CustomProviderConfig["capabilities"],
        checksum: form.checksum,
        origin:
          (form.origin as CustomProviderConfig["origin"]) ||
          (form.builtin
            ? "builtin-override"
            : form.sourceUrl?.startsWith("registry://")
              ? "registry"
              : "local"),
        builtin: form.builtin || Boolean(builtinProvider),
        createdAt: form.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await api.upsertCustomProvider(next);
      await api.setProviderEnabled(id, form.enabled);
      if (id === "youtube" && form.extractorUrl.trim() !== settings?.extractorUrl) {
        await updateSettings({ extractorUrl: form.extractorUrl.trim() });
      }
      Message.success("Provider configuration saved.");
      await refresh();
      navigate("/settings/providers");
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form?.id || !form.removable) return;
    try {
      await api.uninstallProvider(form.id);
      Message.success("Provider uninstalled");
      navigate("/settings/providers");
    } catch (e) {
      Message.error(e instanceof Error ? e.message : String(e));
    }
  };

  if (!settings || !loaded || !form) {
    return <div className="text-t-secondary">Loading…</div>;
  }

  const engineInfo = PROVIDER_ENGINES.find((e) => e.id === form.engine);
  const showExtractor =
    form.engine === "piped" || form.id === "youtube" || Boolean(form.extractorUrl);

  return (
    <div className="provider-detail-page max-w-720px mx-auto">
      <div className="provider-detail-topbar">
        <div className="min-w-0">
          <button type="button" className="provider-detail-back" onClick={goBack}>
            <Left theme="outline" size="14" fill="currentColor" />
            All providers
          </button>
          <div className="flex items-center gap-10px mt-8px min-w-0">
            <ProviderLogo id={form.id || "custom"} label={form.label || "Provider"} size={28} />
            <h1 className="provider-detail-title truncate">{form.label || "New provider"}</h1>
            {form.version && (
              <Tag size="small" color="gray">
                v{form.version}
              </Tag>
            )}
          </div>
        </div>
        <div className="flex items-center gap-8px shrink-0">
          <Button onClick={goBack}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>

      <div className="provider-detail-banner">
        <Info theme="outline" size="16" fill="currentColor" />
        <span>
          Providers work like extensions: a source package, logo, and{" "}
          <code>pinforge.provider.json</code> manifest drive engine and download defaults.
        </span>
      </div>

      {form.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-6px mb-14px">
          {form.capabilities.map((c) => (
            <Tag key={c} size="small" color="gray">
              {CAPABILITY_LABELS[c as ProviderCapability] ?? c}
            </Tag>
          ))}
          {form.origin && (
            <Tag size="small" color="arcoblue">
              {form.origin}
            </Tag>
          )}
          {form.checksum && (
            <Tag size="small" color="green">
              checksum {form.checksum.slice(0, 8)}…
            </Tag>
          )}
        </div>
      )}

      <Section title="Identity" badge={{ text: "Applies immediately", tone: "now" }}>
        <FieldRow label="Logo">
          <div className="provider-detail-avatar">
            <ProviderLogo id={form.id || "custom"} label={form.label || "P"} size={36} />
          </div>
        </FieldRow>
        <FieldRow label="Name">
          <Input
            value={form.label}
            disabled={form.builtin && !isNew}
            onChange={(v) =>
              setForm((f) =>
                f
                  ? {
                      ...f,
                      label: v,
                      id: f.builtin || !isNew ? f.id : slugifyProviderId(v),
                    }
                  : f
              )
            }
          />
        </FieldRow>
        <FieldRow label="ID" hint="Used internally to identify this provider.">
          <Input value={form.id || "(auto)"} disabled readOnly />
        </FieldRow>
        <FieldRow label="Description">
          <Input
            placeholder="What this provider downloads"
            value={form.notes || form.description}
            onChange={(v) => setForm((f) => (f ? { ...f, notes: v } : f))}
          />
        </FieldRow>
      </Section>

      <Section title="Engine" badge={{ text: "Download service", tone: "now" }}>
        <FieldRow
          label="Download engine"
          hint={engineInfo?.description ?? "How Pinforge resolves media for this site."}
        >
          <Select
            className="w-full"
            value={form.engine}
            onChange={(v) => setForm((f) => (f ? { ...f, engine: v as ProviderEngineId } : f))}
          >
            {PROVIDER_ENGINES.map((eng) => (
              <Select.Option key={eng.id} value={eng.id}>
                {eng.label}
              </Select.Option>
            ))}
          </Select>
        </FieldRow>
        {showExtractor && (
          <FieldRow
            label="Extractor API"
            hint="Piped/Invidious base URL used as fallback. Leave empty for the built-in extractor."
          >
            <Input
              placeholder="https://api.piped.example.com"
              value={form.extractorUrl}
              onChange={(v) => setForm((f) => (f ? { ...f, extractorUrl: v } : f))}
            />
          </FieldRow>
        )}
      </Section>

      <Section
        title="Extension source"
        badge={{ text: "Manifest", tone: "later" }}
        action={
          <Button
            size="mini"
            loading={busy}
            icon={<Upload theme="outline" size="12" />}
            onClick={() => void installSource()}
          >
            Upload package
          </Button>
        }
      >
        <div className="provider-ext-source">
          <div className="provider-ext-source__icon" aria-hidden>
            {PROVIDER_LOGOS[form.id] ? (
              <ProviderLogo id={form.id} label={form.label} size={28} />
            ) : (
              <FolderOpen theme="outline" size="22" fill="currentColor" />
            )}
          </div>
          <div className="provider-ext-source__meta min-w-0">
            <div className="text-13px font-500 text-t-primary truncate">
              {form.sourcePath ? fileLeaf(form.sourcePath) : "No package installed"}
            </div>
            <div className="text-12px text-t-tertiary mt-2px truncate">
              {form.sourcePath || "Upload a folder or file with pinforge.provider.json"}
            </div>
          </div>
          {form.sourcePath && (
            <Button
              size="mini"
              type="text"
              onClick={() => void api.showItemInFolder(form.sourcePath)}
            >
              Reveal
            </Button>
          )}
        </div>

        <div className="provider-ext-source provider-ext-source--manifest mt-10px">
          <div className="provider-ext-source__icon" aria-hidden>
            <FileCode theme="outline" size="22" fill="currentColor" />
          </div>
          <div className="provider-ext-source__meta min-w-0">
            <div className="text-13px font-500 text-t-primary truncate">
              {form.manifestPath ? fileLeaf(form.manifestPath) : "Manifest"}
            </div>
            <div className="text-12px text-t-tertiary mt-2px truncate">
              {form.manifestPath || "pinforge.provider.json — id, engine, hosts, formats"}
            </div>
          </div>
          <Button
            size="mini"
            loading={busy}
            disabled={!form.sourcePath && !form.manifestPath}
            onClick={() => void reloadManifest()}
          >
            Reload
          </Button>
        </div>

        {form.manifest && (
          <pre className="provider-manifest-preview mt-12px">
            {JSON.stringify(form.manifest, null, 2)}
          </pre>
        )}
      </Section>

      <Section title="Download defaults" badge={{ text: "Applies immediately", tone: "now" }}>
        <FieldRow label="Enabled" hint="When off, Pinforge will skip this provider.">
          <Switch
            checked={form.enabled}
            onChange={(v) => setForm((f) => (f ? { ...f, enabled: v } : f))}
          />
        </FieldRow>
        <FieldRow label="Hosts" hint="Comma-separated domains this provider handles.">
          <Input
            placeholder="example.com, www.example.com"
            value={form.hosts}
            onChange={(v) => setForm((f) => (f ? { ...f, hosts: v } : f))}
          />
        </FieldRow>
        <FieldRow label="Default format" hint="Preferred output when this provider downloads.">
          <Select
            className="w-full"
            value={form.format}
            allowCreate
            onChange={(v) => setForm((f) => (f ? { ...f, format: String(v) } : f))}
          >
            {(form.formats.length ? form.formats : ["best", "mp4", "audio-only"]).map((fmt) => (
              <Select.Option key={fmt} value={fmt}>
                {fmt}
              </Select.Option>
            ))}
          </Select>
        </FieldRow>
        <div className="flex gap-8px pt-4px flex-wrap">
          {form.live && (
            <Tag size="small" color="green">
              Available
            </Tag>
          )}
          {form.builtin && (
            <Tag size="small" color="arcoblue">
              Built-in
            </Tag>
          )}
          {form.sourceUrl?.startsWith("registry://") && (
            <Tag size="small" color="gray">
              Registry
            </Tag>
          )}
          {form.sourcePath && (
            <Tag size="small" color="gray">
              Extension
            </Tag>
          )}
          <Tag size="small" color="arcoblue">
            {engineInfo?.label ?? form.engine}
          </Tag>
        </div>
      </Section>

      <Section
        title="Format plugins"
        badge={{ text: "Download service", tone: "later" }}
        action={
          <Button
            size="mini"
            loading={busy}
            icon={<Upload theme="outline" size="12" />}
            onClick={() => void uploadPlugin()}
          >
            Upload plugin
          </Button>
        }
      >
        <div className="text-12px text-t-tertiary mb-10px">
          Upload format helpers (.js / .json) used when resolving output for this provider’s
          downloads.
        </div>
        {form.formatPlugins.length === 0 ? (
          <div className="text-13px text-t-secondary py-8px">No format plugins attached.</div>
        ) : (
          <div className="flex flex-col gap-8px">
            {form.formatPlugins.map((plugin) => (
              <div key={plugin.id} className="provider-ext-source">
                <div className="provider-ext-source__icon" aria-hidden>
                  <FileCode theme="outline" size="20" fill="currentColor" />
                </div>
                <div className="provider-ext-source__meta min-w-0 flex-1">
                  <div className="text-13px font-500 text-t-primary truncate">{plugin.label}</div>
                  <div className="text-12px text-t-tertiary mt-2px truncate">
                    {fileLeaf(plugin.sourcePath)}
                    {plugin.version ? ` · v${plugin.version}` : ""}
                  </div>
                </div>
                <Switch
                  size="small"
                  checked={plugin.enabled}
                  onChange={(v) =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            formatPlugins: f.formatPlugins.map((p) =>
                              p.id === plugin.id ? { ...p, enabled: v } : p
                            ),
                          }
                        : f
                    )
                  }
                />
                <Button
                  size="mini"
                  type="text"
                  status="danger"
                  onClick={() =>
                    setForm((f) =>
                      f
                        ? { ...f, formatPlugins: f.formatPlugins.filter((p) => p.id !== plugin.id) }
                        : f
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {form.removable && !isNew && (
        <div className="flex justify-end pt-8px">
          <Button status="danger" type="outline" onClick={() => void remove()}>
            Remove provider
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProviderDetailPage;

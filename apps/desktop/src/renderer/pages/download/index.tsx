import React, { useEffect, useMemo, useState } from "react";
import { Dropdown, Menu, Tooltip } from "@arco-design/web-react";
import {
  ArrowUp,
  Magic,
  Down,
  FolderOpen,
} from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@renderer/hooks/context/AppContext";
import { api, type DetectedProvider, type FormatPreset, type PresetName } from "@renderer/api";
import { PlatformIcon, PLATFORMS, type PlatformId } from "./platforms";

const DownloadPage: React.FC = () => {
  const { settings, busy, processUrl, updateSettings } = useApp();
  const [url, setUrl] = useState("");
  const [detected, setDetected] = useState<DetectedProvider | null>(null);
  const [format, setFormat] = useState<FormatPreset>("best");
  const [enhance, setEnhance] = useState(true);
  const [filter, setFilter] = useState<PlatformId | "auto">("auto");
  const navigate = useNavigate();

  useEffect(() => {
    if (settings) {
      setFormat(settings.format);
      setEnhance(settings.enhance);
    }
  }, [settings]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!url.trim()) {
        setDetected(null);
        return;
      }
      api.detectProvider(url.trim()).then(setDetected).catch(() => setDetected(null));
    }, 280);
    return () => clearTimeout(t);
  }, [url]);

  const activePlatform = useMemo((): PlatformId | null => {
    if (detected?.id) return detected.id as PlatformId;
    if (filter !== "auto") return filter;
    return null;
  }, [detected, filter]);

  const platformMeta = PLATFORMS.find((p) => p.id === activePlatform) ?? null;

  if (!settings) {
    return <div className="text-t-secondary p-24px">Loading…</div>;
  }

  const canRun =
    url.trim().length > 0 && !!settings.outDir && !busy && (!detected || detected.live);
  const showFormat = Boolean(detected?.live && (detected.formats?.length ?? 0) > 1);
  const showEnhance = !detected || detected.id === "pinterest";

  const submit = () => {
    if (!canRun) return;
    const target = url.trim();
    setUrl("");
    navigate("/tasks");
    void processUrl(target, { enhance, format });
  };

  const formatLabel = format === "audio-only" ? "Audio" : format.toUpperCase();

  return (
    <div className="home-hero flex flex-col h-full min-h-0 -m-24px">
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-20px pb-32px">
        <h1 className="home-hero__greeting m-0 text-t-primary font-600 tracking-tight text-center">
          What do you want to download?
        </h1>
        <p className="m-0 mt-10px text-t-secondary text-14px text-center max-w-460px leading-relaxed">
          Paste a link — Pinforge detects the platform and saves locally.
        </p>

        {/* Platform pills */}
        <div className="home-platform-bar mt-28px" role="tablist" aria-label="Platforms">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "auto"}
            className={`home-platform-pill ${filter === "auto" && !detected ? "is-active" : ""}`}
            onClick={() => setFilter("auto")}
          >
            <span className="home-platform-pill__dot home-platform-pill__dot--auto" />
            Auto
          </button>
          {PLATFORMS.filter((p) => p.live).map((p) => {
            const selected =
              (detected?.id === p.id) || (filter === p.id && !detected);
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`home-platform-pill ${selected ? "is-active" : ""}`}
                onClick={() => {
                  setFilter(p.id);
                  if (!url.trim()) setDetected(null);
                }}
                title={p.label}
              >
                <PlatformIcon id={p.id} size={16} />
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Composer */}
        <div className="home-composer-card mt-22px w-full max-w-680px">
          <div className="home-composer-card__body">
            <div className="flex items-start gap-12px px-4px pt-2px">
              <div
                className="home-composer-card__platform shrink-0"
                style={
                  platformMeta
                    ? { background: platformMeta.tint, color: platformMeta.accent }
                    : undefined
                }
                title={platformMeta?.label ?? "Paste a URL"}
              >
                {platformMeta ? (
                  <PlatformIcon id={platformMeta.id} size={18} />
                ) : (
                  <span className="text-13px font-600 opacity-70">URL</span>
                )}
              </div>
              <textarea
                className="home-composer-card__textarea"
                placeholder="Paste a media URL…"
                value={url}
                disabled={busy}
                rows={2}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </div>

            {detected && !detected.live && (
              <div className="home-composer-card__hint home-composer-card__hint--warn">
                {detected.label} is coming soon
              </div>
            )}

            <div className="home-composer-card__toolbar">
              <div className="flex items-center gap-6px flex-wrap min-w-0">
                {showEnhance && (
                  <Tooltip content="Enhance stills with sharp">
                    <button
                      type="button"
                      className={`home-tool-chip ${enhance ? "is-on" : ""}`}
                      disabled={busy}
                      onClick={() => setEnhance((v) => !v)}
                    >
                      <Magic theme="outline" size="14" fill="currentColor" strokeWidth={3} />
                      Enhance {enhance ? "on" : "off"}
                    </button>
                  </Tooltip>
                )}

                {showEnhance && enhance && (
                  <Dropdown
                    droplist={
                      <Menu
                        onClickMenuItem={(key) =>
                          void updateSettings({ preset: key as PresetName })
                        }
                      >
                        {(Object.keys(settings.presets) as PresetName[]).map((key) => (
                          <Menu.Item key={key}>{settings.presets[key].label}</Menu.Item>
                        ))}
                      </Menu>
                    }
                    trigger="click"
                    position="tl"
                  >
                    <button type="button" className="home-tool-chip" disabled={busy}>
                      {settings.presets[settings.preset]?.label ?? "Preset"}
                      <Down theme="outline" size="12" fill="currentColor" strokeWidth={3} />
                    </button>
                  </Dropdown>
                )}

                {showFormat && (
                  <Dropdown
                    droplist={
                      <Menu
                        onClickMenuItem={(key) => {
                          setFormat(key as FormatPreset);
                          void updateSettings({ format: key as FormatPreset });
                        }}
                      >
                        {(detected?.formats ?? ["best"]).map((f) => (
                          <Menu.Item key={f}>{f}</Menu.Item>
                        ))}
                      </Menu>
                    }
                    trigger="click"
                    position="tl"
                  >
                    <button type="button" className="home-tool-chip" disabled={busy}>
                      {formatLabel}
                      <Down theme="outline" size="12" fill="currentColor" strokeWidth={3} />
                    </button>
                  </Dropdown>
                )}
              </div>

              <button
                type="button"
                className="home-send-btn"
                disabled={!canRun}
                aria-label="Download"
                onClick={submit}
              >
                {busy ? (
                  <span className="home-send-btn__spin" />
                ) : (
                  <ArrowUp theme="filled" size="18" fill="currentColor" />
                )}
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="home-out-hint mt-14px"
          onClick={async () => {
            const dir = await api.pickFolder();
            if (dir) await updateSettings({ outDir: dir });
          }}
        >
          <FolderOpen theme="outline" size="14" fill="currentColor" strokeWidth={3} />
          <span className="truncate max-w-360px">{settings.outDir}</span>
        </button>
      </div>
    </div>
  );
};

export default DownloadPage;

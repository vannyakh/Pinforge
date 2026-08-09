import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Select, Spin, Switch, Tooltip } from "@arco-design/web-react";
import { ArrowUp, FolderOpen, Plus, Clear } from "@icon-park/react";
import { useApp } from "@renderer/hooks/context/AppContext";
import {
  api,
  type DetectedProvider,
  type ExtractPreview,
  type FormatPreset,
} from "@renderer/api";
import { PlatformIcon, PLATFORMS, type PlatformId } from "./platforms";
import PlatformSelectionBar, { type PlatformFilter } from "./PlatformSelectionBar";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  url?: string;
  detected?: DetectedProvider | null;
  extract?: ExtractPreview | null;
  status?: "detecting" | "ready" | "error" | "started";
  pendingConfirm?: boolean;
};

const SUGGESTIONS = [
  {
    label: "Download a YouTube video in best quality",
    fill: "https://www.youtube.com/watch?v=",
    filter: "youtube" as PlatformId,
  },
  {
    label: "Save a Pinterest board with enhance on",
    fill: "https://www.pinterest.com/",
    filter: "pinterest" as PlatformId,
  },
  {
    label: "Grab audio only from a media link",
    fill: "",
    filter: "auto" as const,
    format: "audio-only" as FormatPreset,
  },
];

const ALL_MODES = ["single", "board", "playlist", "profile", "story"] as const;

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDetected(extract: ExtractPreview): DetectedProvider {
  return {
    id: extract.provider.id,
    label: extract.provider.label,
    live: extract.provider.live,
    formats: extract.formats,
    modes: extract.supportedModes,
  };
}

function describeExtract(extract: ExtractPreview): string {
  if (!extract.provider.live || extract.provider.id === "unknown") {
    return extract.message ?? "I couldn't recognize that link.";
  }
  if (!extract.modeSupported) {
    return extract.message ?? `${extract.provider.label} ${extract.mode} is not supported yet.`;
  }
  if (extract.itemCount > 1) {
    return extract.message ?? `Extracted ${extract.itemCount} items from ${extract.provider.label}.`;
  }
  return extract.message ?? `Detected ${extract.provider.label}. Ready to download.`;
}

const DownloadPage: React.FC = () => {
  const { settings, busy, processUrl, updateSettings } = useApp();
  const [url, setUrl] = useState("");
  const [filter, setFilter] = useState<PlatformFilter>("auto");
  const [inputFocused, setInputFocused] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [confirmFormat, setConfirmFormat] = useState<FormatPreset>("best");
  const [confirmEnhance, setConfirmEnhance] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [processStartedAt, setProcessStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const hasChat = messages.length > 0;
  const showProcessing = extracting || busy;

  useEffect(() => {
    if (settings) {
      setConfirmFormat(settings.format);
      setConfirmEnhance(settings.enhance);
    }
  }, [settings]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, extracting, busy]);

  useEffect(() => {
    if (!showProcessing) {
      setProcessStartedAt(null);
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    setProcessStartedAt(started);
    setElapsedSec(0);
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [showProcessing]);

  const pendingConfirmMsg = useMemo(
    () => messages.find((m) => m.pendingConfirm && m.status === "ready"),
    [messages]
  );

  if (!settings) {
    return <div className="text-t-secondary p-24px">Loading…</div>;
  }

  const autoDownload = settings.autoDownload !== false;
  const canSubmit =
    url.trim().length > 0 && !!settings.outDir && !busy && !extracting;
  const hasUrl = url.trim().length > 0;
  const showEnhanceConfirm =
    !pendingConfirmMsg?.detected || pendingConfirmMsg.detected.id === "pinterest";

  const startDownload = async (
    targetUrl: string,
    opts: { format: FormatPreset; enhance: boolean }
  ) => {
    await processUrl(targetUrl, {
      enhance: opts.enhance,
      format: opts.format,
    });
  };

  const handleExtract = async (raw: string) => {
    const target = raw.trim();
    if (!target || !settings.outDir || busy || extracting) return;

    setUrl("");
    setExtracting(true);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: target,
      url: target,
    };
    const assistantId = uid();
    const detectingMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      text: "Extracting source…",
      url: target,
      status: "detecting",
    };
    setMessages((prev) => [...prev, userMsg, detectingMsg]);

    let extract: ExtractPreview | null = null;
    try {
      extract = await api.extractPreview(target);
    } catch (err) {
      extract = {
        sourceUrl: target,
        provider: { id: "unknown", label: "Unknown", live: false },
        mode: "single",
        modeSupported: false,
        formats: [],
        supportedModes: [],
        items: [],
        itemCount: 0,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const detected = toDetected(extract);
    const replyText = describeExtract(extract);
    const canDownload = Boolean(extract.modeSupported && extract.provider.live && extract.itemCount > 0);
    const shouldAuto = autoDownload && canDownload;

    const formats = extract.formats?.length
      ? extract.formats
      : (["best", "mp4", "audio-only"] as FormatPreset[]);
    const nextFormat = (
      formats.includes(settings.format) ? settings.format : formats[0]
    ) as FormatPreset;
    setConfirmFormat(nextFormat);
    setConfirmEnhance(settings.enhance);

    if (shouldAuto) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: `${replyText}\nStarting download…`,
                detected,
                extract,
                status: "started",
                pendingConfirm: false,
              }
            : m
        )
      );
      setExtracting(false);
      void startDownload(target, {
        format: nextFormat,
        enhance: settings.enhance,
      });
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              text: canDownload
                ? `${replyText}\nConfirm options below to start the download.`
                : replyText,
              detected,
              extract,
              status: canDownload ? "ready" : "error",
              pendingConfirm: canDownload,
            }
          : { ...m, pendingConfirm: false }
      )
    );
    setExtracting(false);
  };

  const confirmDownload = () => {
    const msg = pendingConfirmMsg;
    if (!msg?.url || !msg.detected?.live || !msg.extract?.modeSupported) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              text: `${describeExtract(m.extract!)}\nDownload started.`,
              pendingConfirm: false,
              status: "started",
            }
          : m
      )
    );
    void startDownload(msg.url, {
      format: confirmFormat,
      enhance: showEnhanceConfirm ? confirmEnhance : false,
    });
  };

  const cancelConfirm = () => {
    setMessages((prev) =>
      prev.map((m) =>
        m.pendingConfirm
          ? {
              ...m,
              pendingConfirm: false,
              text: `${m.extract ? describeExtract(m.extract) : m.text.split("\n")[0]}\nCancelled. Paste another link when you're ready.`,
              status: "ready",
            }
          : m
      )
    );
  };

  const applySuggestion = (s: (typeof SUGGESTIONS)[number]) => {
    if (s.filter === "auto") setFilter("auto");
    else setFilter(s.filter);
    if (s.format) {
      setConfirmFormat(s.format);
      void updateSettings({ format: s.format });
    }
    if (s.fill) setUrl(s.fill);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl(text.trim());
        textareaRef.current?.focus();
      }
    } catch {
      textareaRef.current?.focus();
    }
  };

  const clearUrl = () => {
    setUrl("");
    textareaRef.current?.focus();
  };

  const processingChip = showProcessing ? (
    <div className="home-processing">
      <Spin size={14} />
      <span className="home-processing__text">
        {extracting ? "Processing…" : "Downloading…"}
        <span className="home-processing__elapsed">({elapsedSec}s)</span>
      </span>
    </div>
  ) : null;

  const composer = (
    <div className="home-composer-stack">
      {hasChat && processingChip}
      <div className={`home-composer-shell ${inputFocused ? "is-active" : ""}`}>
        <div className="home-composer-card">
          <div className="home-composer-card__body">
            <textarea
              ref={textareaRef}
              className="home-composer-card__textarea home-composer-card__textarea--chat"
              placeholder="Paste a media URL, or type a link to download…"
              value={url}
              disabled={busy || extracting}
              rows={2}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleExtract(url);
                }
              }}
            />

            <div className="home-composer-card__toolbar">
              <div className="flex items-center gap-8px min-w-0">
                <Tooltip content={hasUrl ? "Clear" : "Paste from clipboard"}>
                  <button
                    type="button"
                    className="home-icon-btn"
                    disabled={busy || extracting}
                    aria-label={hasUrl ? "Clear" : "Paste from clipboard"}
                    onClick={() => {
                      if (hasUrl) clearUrl();
                      else void pasteFromClipboard();
                    }}
                  >
                    {hasUrl ? (
                      <Clear theme="outline" size="16" fill="currentColor" strokeWidth={3} />
                    ) : (
                      <Plus theme="outline" size="16" fill="currentColor" strokeWidth={3} />
                    )}
                  </button>
                </Tooltip>
              </div>

              <div className="flex items-center gap-6px shrink-0">
                <button
                  type="button"
                  className="home-send-btn"
                  disabled={!canSubmit}
                  aria-label="Send"
                  onClick={() => void handleExtract(url)}
                >
                  {extracting || busy ? (
                    <span className="home-send-btn__spin" />
                  ) : (
                    <ArrowUp theme="filled" size="18" fill="currentColor" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="home-workspace-footnote"
        onClick={async () => {
          const dir = await api.pickFolder();
          if (dir) await updateSettings({ outDir: dir });
        }}
      >
        <FolderOpen theme="outline" size="14" fill="currentColor" strokeWidth={3} />
        <span className="truncate max-w-280px">
          {settings.outDir ? settings.outDir : "Work in a folder"}
        </span>
      </button>
    </div>
  );

  return (
    <div className="home-hero flex flex-col h-full min-h-0 -m-24px">
      <div
        className={`home-hero__stage flex-1 min-h-0 flex flex-col ${
          hasChat
            ? "home-hero__stage--chat justify-start"
            : "items-center justify-center px-16px pb-40px"
        }`}
      >
        <div
          className={`home-guid-layout w-full ${
            hasChat ? "home-guid-layout--chat flex flex-col flex-1 min-h-0" : ""
          }`}
        >
          {!hasChat && (
            <>
              <div className="home-hero__header">
                <h1 className="home-hero__greeting m-0 text-t-primary text-center">
                  Hi, what do you want to download?
                </h1>
              </div>

              <PlatformSelectionBar value={filter} onChange={(id) => setFilter(id)} />

              {composer}

              <div className="home-suggest mt-18px w-full">
                <div className="home-suggest__title">Try these</div>
                <ul className="home-suggest__list">
                  {SUGGESTIONS.map((s) => (
                    <li key={s.label}>
                      <button
                        type="button"
                        className="home-suggest__item"
                        onClick={() => applySuggestion(s)}
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {hasChat && (
            <div className="home-chat-layout flex flex-col flex-1 min-h-0 w-full chat-surface-container px-20px">
              <div className="home-chat flex-1 min-h-0 overflow-y-auto -mx-20px px-20px pb-10px box-border">
                <div className="home-chat__thread chat-surface-fluid">
                  <div className="h-10px" />
                  {messages.map((msg) => {
                    const meta = msg.detected ? platformMetaFor(msg.detected.id) : null;
                    const extract = msg.extract;
                    return (
                      <div
                        key={msg.id}
                        className={`home-chat__row message-item home-chat__row--${msg.role}`}
                      >
                        <div className={`home-chat__bubble home-chat__bubble--${msg.role}`}>
                          {msg.role === "assistant" && msg.detected && (
                            <div className="home-chat__meta">
                              <span
                                className="home-composer-card__platform-chip"
                                style={
                                  meta
                                    ? { background: meta.tint, color: meta.accent }
                                    : undefined
                                }
                              >
                                {msg.detected.id !== "auto" && msg.detected.id !== "unknown" && (
                                  <PlatformIcon id={msg.detected.id as PlatformId} size={14} />
                                )}
                                {msg.detected.label}
                              </span>
                              {extract && (
                                <span className="home-chat__mode-chip">{extract.mode}</span>
                              )}
                              <span className="home-chat__status">
                                {msg.status === "detecting"
                                  ? "Extracting"
                                  : msg.status === "started"
                                    ? "Downloading"
                                    : extract?.modeSupported
                                      ? "Ready"
                                      : "Unsupported"}
                              </span>
                            </div>
                          )}
                          <div className="home-chat__text whitespace-pre-wrap">{msg.text}</div>

                          {msg.role === "assistant" && extract && msg.status !== "detecting" && (
                            <div className="home-extract">
                              <div className="home-extract__section">
                                <div className="home-extract__label">Source</div>
                                <div className="home-extract__source">
                                  {extract.title && (
                                    <div className="home-extract__title">{extract.title}</div>
                                  )}
                                  <a
                                    className="home-extract__url"
                                    href={extract.sourceUrl}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      void api.openExternal(extract.sourceUrl);
                                    }}
                                  >
                                    {extract.sourceUrl}
                                  </a>
                                  <div className="home-extract__stats">
                                    <span>{extract.itemCount} item{extract.itemCount === 1 ? "" : "s"}</span>
                                    <span>·</span>
                                    <span>{extract.mode}</span>
                                    <span>·</span>
                                    <span>{extract.modeSupported ? "supported" : "not supported"}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="home-extract__section">
                                <div className="home-extract__label">Support</div>
                                <div className="home-extract-table-wrap">
                                  <table className="home-extract-table">
                                    <thead>
                                      <tr>
                                        <th>Mode</th>
                                        <th>Status</th>
                                        <th>Formats</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {ALL_MODES.map((mode) => {
                                        const advertised = extract.supportedModes.includes(mode);
                                        const active = extract.mode === mode;
                                        const ok = advertised && extract.provider.live;
                                        return (
                                          <tr
                                            key={mode}
                                            className={active ? "is-active" : undefined}
                                          >
                                            <td>
                                              {mode}
                                              {active ? " · current" : ""}
                                            </td>
                                            <td>
                                              {!extract.provider.live
                                                ? "coming soon"
                                                : ok
                                                  ? "supported"
                                                  : "—"}
                                            </td>
                                            <td>
                                              {ok
                                                ? extract.formats.join(", ") || "—"
                                                : "—"}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {extract.items.length > 0 && (
                                <div className="home-extract__section">
                                  <div className="home-extract__label">
                                    Extract list
                                    {extract.itemCount > 1 ? ` (${extract.itemCount})` : ""}
                                  </div>
                                  <div className="home-extract-table-wrap home-extract-table-wrap--list">
                                    <table className="home-extract-table">
                                      <thead>
                                        <tr>
                                          <th style={{ width: 44 }}>#</th>
                                          <th>Title</th>
                                          <th>URL</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {extract.items.slice(0, 50).map((item) => (
                                          <tr key={`${item.index}-${item.url}`}>
                                            <td>{item.index}</td>
                                            <td>{item.title || `Item ${item.index}`}</td>
                                            <td>
                                              <button
                                                type="button"
                                                className="home-extract__link-btn"
                                                title={item.url}
                                                onClick={() => void api.openExternal(item.url)}
                                              >
                                                {item.url}
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  {extract.itemCount > 50 && (
                                    <div className="home-extract__more">
                                      Showing first 50 of {extract.itemCount} items
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {msg.pendingConfirm && msg.detected?.live && extract?.modeSupported && (
                            <div className="home-chat-confirm">
                              <div className="home-chat-confirm__title">Download options</div>
                              <div className="home-chat-confirm__row">
                                <span className="home-chat-confirm__label">Format</span>
                                <Select
                                  size="small"
                                  style={{ width: 140 }}
                                  value={confirmFormat}
                                  onChange={(v) => setConfirmFormat(v as FormatPreset)}
                                >
                                  {(extract.formats?.length
                                    ? extract.formats
                                    : ["best", "mp4", "audio-only"]
                                  ).map((f) => (
                                    <Select.Option key={f} value={f}>
                                      {f}
                                    </Select.Option>
                                  ))}
                                </Select>
                              </div>
                              {showEnhanceConfirm && (
                                <div className="home-chat-confirm__row">
                                  <span className="home-chat-confirm__label">Enhance</span>
                                  <Switch
                                    size="small"
                                    checked={confirmEnhance}
                                    onChange={setConfirmEnhance}
                                  />
                                </div>
                              )}
                              <div className="home-chat-confirm__actions">
                                <Button size="small" onClick={cancelConfirm}>
                                  Cancel
                                </Button>
                                <Button
                                  type="primary"
                                  size="small"
                                  loading={busy}
                                  onClick={confirmDownload}
                                >
                                  Download{extract.itemCount > 1 ? ` ${extract.itemCount}` : ""}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="h-20px" />
                  <div ref={chatEndRef} />
                </div>
              </div>

              <div className="home-chat__sendbox shrink-0">
                <div className="chat-surface-fluid home-chat__sendbox-inner">
                  {composer}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function platformMetaFor(id: string) {
  return PLATFORMS.find((p: (typeof PLATFORMS)[number]) => p.id === id) ?? null;
}

export default DownloadPage;

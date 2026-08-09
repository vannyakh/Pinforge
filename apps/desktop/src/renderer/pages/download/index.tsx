import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Select, Spin, Switch } from "@arco-design/web-react";
import { ArrowRightUp } from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@renderer/hooks/context/AppContext";
import {
  api,
  type DetectedProvider,
  type ExtractPreview,
  type FormatPreset,
  type YoutubeQuality,
  type AudioContainer,
  type SubtitleMode,
  type YoutubeDownloadOptions,
} from "@renderer/api";
import { PlatformIcon, PLATFORMS, type PlatformId } from "./platforms";
import PlatformSelectionBar from "./PlatformSelectionBar";
import {
  selectPendingConfirm,
  useHomeChatStore,
  type ChatDownloadResult,
  type ChatMessage,
} from "./homeChatStore";
import GuidHomeInputCard from "./guid/GuidHomeInputCard";
import GuidHomeActionRow from "./guid/GuidHomeActionRow";
import styles from "./guid/guid.module.css";
import "./guid/guid-sendbox.css";

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

/** Pull one or more http(s) links from pasted text (newline / space separated). */
function parseMediaUrls(raw: string): string[] {
  const matches = raw.match(/https?:\/\/[^\s<>"'`]+/gi) ?? [];
  const cleaned = matches.map((u) => u.replace(/[),.;]+$/g, "").trim()).filter(Boolean);
  return [...new Set(cleaned)];
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
  const navigate = useNavigate();
  const { settings, busy, processUrl, updateSettings } = useApp();

  const url = useHomeChatStore((s) => s.url);
  const filter = useHomeChatStore((s) => s.filter);
  const messages = useHomeChatStore((s) => s.messages);
  const confirmFormat = useHomeChatStore((s) => s.confirmFormat);
  const confirmEnhance = useHomeChatStore((s) => s.confirmEnhance);
  const confirmYtQuality = useHomeChatStore((s) => s.confirmYtQuality);
  const confirmAudio = useHomeChatStore((s) => s.confirmAudio);
  const confirmSubs = useHomeChatStore((s) => s.confirmSubs);
  const extracting = useHomeChatStore((s) => s.extracting);
  const setUrl = useHomeChatStore((s) => s.setUrl);
  const setFilter = useHomeChatStore((s) => s.setFilter);
  const setConfirmFormat = useHomeChatStore((s) => s.setConfirmFormat);
  const setConfirmEnhance = useHomeChatStore((s) => s.setConfirmEnhance);
  const setConfirmYtQuality = useHomeChatStore((s) => s.setConfirmYtQuality);
  const setConfirmAudio = useHomeChatStore((s) => s.setConfirmAudio);
  const setConfirmSubs = useHomeChatStore((s) => s.setConfirmSubs);
  const setExtracting = useHomeChatStore((s) => s.setExtracting);
  const appendMessages = useHomeChatStore((s) => s.appendMessages);
  const mapMessages = useHomeChatStore((s) => s.mapMessages);

  const [inputFocused, setInputFocused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const hasChat = messages.length > 0;
  const showProcessing = extracting || busy;

  useEffect(() => {
    if (settings) {
      setConfirmFormat(settings.format);
      setConfirmEnhance(settings.enhance);
      setConfirmYtQuality(settings.youtube?.quality ?? "best");
      setConfirmAudio(settings.youtube?.audioContainer ?? "m4a");
      setConfirmSubs(settings.youtube?.subtitles ?? "separate");
    }
  }, [
    settings,
    setConfirmFormat,
    setConfirmEnhance,
    setConfirmYtQuality,
    setConfirmAudio,
    setConfirmSubs,
  ]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, extracting, busy]);

  useEffect(() => {
    if (!showProcessing) {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    setElapsedSec(0);
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [showProcessing]);

  const pendingConfirmMsg = useMemo(
    () => selectPendingConfirm(messages),
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
  const showYoutubeConfirm = pendingConfirmMsg?.detected?.id === "youtube";

  const startDownload = async (
    targetUrls: string | string[],
    opts: {
      format: FormatPreset;
      enhance: boolean;
      youtube?: Partial<YoutubeDownloadOptions>;
      assistantId: string;
    }
  ) => {
    const urls = Array.isArray(targetUrls) ? targetUrls : [targetUrls];
    const collected: ChatDownloadResult[] = [];
    let failCount = 0;

    for (let i = 0; i < urls.length; i++) {
      const targetUrl = urls[i];
      mapMessages((prev) =>
        prev.map((m) =>
          m.id === opts.assistantId
            ? {
                ...m,
                text:
                  urls.length > 1
                    ? `Downloading ${i + 1} of ${urls.length}…`
                    : `${(m.text || "").split("\n")[0]}\nStarting download…`,
                status: "started",
                results: collected.length ? [...collected] : m.results,
              }
            : m
        )
      );

      const res = await processUrl(targetUrl, {
        enhance: opts.enhance,
        format: opts.format,
        youtube: opts.youtube,
      });

      if (!res || res.results.length === 0) {
        failCount += 1;
        continue;
      }

      for (const item of res.results) {
        collected.push({
          outPath: item.outPath,
          originalPath: item.originalPath,
          title: item.title,
          sourceUrl: item.sourceUrl || targetUrl,
          provider: item.provider ?? res.provider,
          kind: item.kind,
          packId: res.packId,
        });
      }

      // Progressive cards while batch runs
      if (urls.length > 1) {
        mapMessages((prev) =>
          prev.map((m) =>
            m.id === opts.assistantId
              ? {
                  ...m,
                  results: [...collected],
                  result: collected.length === 1 ? collected[0] : null,
                }
              : m
          )
        );
      }
    }

    const ok = collected.length;
    if (ok === 0) {
      mapMessages((prev) =>
        prev.map((m) =>
          m.id === opts.assistantId
            ? {
                ...m,
                text: "Download failed.",
                status: "failed",
                result: null,
                results: [],
              }
            : m
        )
      );
      return;
    }

    mapMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? {
              ...m,
              text:
                urls.length > 1
                  ? `Download complete — ${ok} saved${failCount ? `, ${failCount} failed` : ""}.`
                  : "Download complete.",
              status: failCount && !ok ? "failed" : "done",
              result: ok === 1 ? collected[0] : null,
              results: collected,
            }
          : m
      )
    );
  };

  const handleExtract = async (raw: string) => {
    const urls = parseMediaUrls(raw);
    if (urls.length === 0 || !settings.outDir || busy || extracting) return;

    const displayText = raw.trim();
    setUrl("");
    setExtracting(true);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: displayText,
      url: urls[0],
    };
    const assistantId = uid();
    const detectingMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      text:
        urls.length > 1
          ? `Found ${urls.length} links. Extracting…`
          : "Extracting source…",
      url: urls[0],
      status: "detecting",
    };
    appendMessages([userMsg, detectingMsg]);

    // Batch: probe first URL for formats/provider defaults, download all live singles
    const extracts: ExtractPreview[] = [];
    for (const u of urls) {
      try {
        extracts.push(await api.extractPreview(u));
      } catch (err) {
        extracts.push({
          sourceUrl: u,
          provider: { id: "unknown", label: "Unknown", live: false },
          mode: "single",
          modeSupported: false,
          formats: [],
          supportedModes: [],
          items: [],
          itemCount: 0,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const downloadable = extracts.filter(
      (e) => e.modeSupported && e.provider.live && e.itemCount > 0
    );
    const primary = downloadable[0] ?? extracts[0];
    const detected = toDetected(primary);
    const isBatch = urls.length > 1;

    const formats = primary.formats?.length
      ? primary.formats
      : (["best", "mp4", "audio-only"] as FormatPreset[]);
    const nextFormat = (
      formats.includes(settings.format) ? settings.format : formats[0]
    ) as FormatPreset;
    setConfirmFormat(nextFormat);
    setConfirmEnhance(settings.enhance);
    setConfirmYtQuality(settings.youtube?.quality ?? "best");
    setConfirmAudio(settings.youtube?.audioContainer ?? "m4a");
    setConfirmSubs(settings.youtube?.subtitles ?? "separate");

    if (downloadable.length === 0) {
      mapMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: isBatch
                  ? `None of the ${urls.length} links can be downloaded yet.`
                  : describeExtract(primary),
                detected,
                extract: primary,
                status: "error",
                pendingConfirm: false,
              }
            : m
        )
      );
      setExtracting(false);
      return;
    }

    const replyText = isBatch
      ? `Ready to download ${downloadable.length} of ${urls.length} links.`
      : describeExtract(primary);
    const shouldAuto = autoDownload;
    const downloadUrls = downloadable.map((e) => e.sourceUrl);
    // Prefer first extract as message extract meta (mode chip)
    const extractForMsg: ExtractPreview = isBatch
      ? {
          ...primary,
          mode: "single",
          itemCount: downloadable.length,
          items: downloadable.map((e, i) => ({
            index: i + 1,
            url: e.sourceUrl,
            title: e.title,
          })),
          message: replyText,
        }
      : primary;

    if (shouldAuto) {
      mapMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: `${replyText}\nStarting download…`,
                detected,
                extract: extractForMsg,
                status: "started",
                pendingConfirm: false,
              }
            : m
        )
      );
      setExtracting(false);
      void startDownload(downloadUrls, {
        format: nextFormat,
        enhance: settings.enhance,
        assistantId,
        youtube:
          detected.id === "youtube"
            ? {
                quality: settings.youtube?.quality ?? "best",
                audioContainer: settings.youtube?.audioContainer ?? "m4a",
                subtitles: settings.youtube?.subtitles ?? "separate",
              }
            : undefined,
      });
      return;
    }

    mapMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              text: `${replyText}\nConfirm options below to start the download.`,
              detected,
              extract: extractForMsg,
              status: "ready",
              pendingConfirm: true,
              // stash all downloadable URLs on extract items for confirm
            }
          : { ...m, pendingConfirm: false }
      )
    );
    setExtracting(false);
  };

  const confirmDownload = () => {
    const msg = pendingConfirmMsg;
    if (!msg?.detected?.live || !msg.extract) return;

    const batchUrls =
      msg.extract.itemCount > 1 && msg.extract.items.length > 0
        ? [...new Set(msg.extract.items.map((i) => i.url))]
        : msg.url
          ? [msg.url]
          : msg.extract.sourceUrl
            ? [msg.extract.sourceUrl]
            : [];
    if (batchUrls.length === 0) return;

    mapMessages((prev) =>
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
    void startDownload(batchUrls, {
      format: confirmFormat,
      enhance: showEnhanceConfirm ? confirmEnhance : false,
      assistantId: msg.id,
      youtube:
        msg.detected?.id === "youtube"
          ? {
              quality: confirmYtQuality,
              audioContainer: confirmAudio,
              subtitles: confirmSubs,
            }
          : undefined,
    });
    if (msg.detected?.id === "youtube") {
      void updateSettings({
        format: confirmFormat,
        youtube: {
          quality: confirmYtQuality,
          audioContainer: confirmAudio,
          subtitles: confirmSubs,
        },
      });
    }
  };

  const cancelConfirm = () => {
    mapMessages((prev) =>
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

  const showEnhanceToolbar = filter === "auto" || filter === "pinterest";

  const actionRow = (
    <GuidHomeActionRow
      hasUrl={hasUrl}
      loading={extracting || busy}
      disabled={!canSubmit}
      format={confirmFormat}
      enhance={confirmEnhance}
      showEnhance={showEnhanceToolbar}
      onPasteOrClear={() => {
        if (hasUrl) clearUrl();
        else void pasteFromClipboard();
      }}
      onFormatChange={(f) => {
        setConfirmFormat(f);
        void updateSettings({ format: f });
      }}
      onEnhanceChange={(v) => {
        setConfirmEnhance(v);
        void updateSettings({ enhance: v });
      }}
      onOpenSettings={() => void navigate("/settings/download")}
      onSend={() => void handleExtract(url)}
    />
  );

  const composer = (
    <div className="home-composer-stack">
      {hasChat && processingChip}
      <GuidHomeInputCard
        input={url}
        onInputChange={setUrl}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleExtract(url);
          }
        }}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        isInputActive={inputFocused}
        disabled={busy || extracting}
        actionRow={actionRow}
        workspaceDir={settings.outDir || ""}
        onSelectWorkspace={(dir) => void updateSettings({ outDir: dir })}
        textareaRef={textareaRef}
      />
    </div>
  );

  return (
    <div
      className={
        hasChat
          ? "home-hero flex flex-col h-full min-h-0 -m-24px"
          : styles.guidContainer
      }
    >
      {hasChat ? (
        <div className="home-hero__stage home-hero__stage--chat flex-1 min-h-0 flex flex-col justify-start">
          <div className="home-guid-layout home-guid-layout--chat w-full flex flex-col flex-1 min-h-0">
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
                                <span className="home-chat__mode-chip">
                                  {extract.itemCount > 1 && extract.mode === "single"
                                    ? `batch · ${extract.itemCount}`
                                    : extract.mode}
                                </span>
                              )}
                              <span className="home-chat__status">
                                {msg.status === "detecting"
                                  ? "Extracting"
                                  : msg.status === "started"
                                    ? "Downloading"
                                    : msg.status === "done"
                                      ? "Done"
                                      : msg.status === "failed"
                                        ? "Failed"
                                        : extract?.modeSupported
                                          ? "Ready"
                                          : "Unsupported"}
                              </span>
                            </div>
                          )}
                          {(() => {
                            const cards: ChatDownloadResult[] =
                              msg.results && msg.results.length > 0
                                ? msg.results
                                : msg.result
                                  ? [msg.result]
                                  : [];
                            const showCards =
                              msg.role === "assistant" &&
                              cards.length > 0 &&
                              (msg.status === "done" || msg.status === "started");
                            const hideText = showCards && msg.status === "done" && cards.length >= 1;
                            return (
                              <>
                                {!hideText && (
                                  <div className="home-chat__text whitespace-pre-wrap">{msg.text}</div>
                                )}
                                {showCards && (
                                  <div className="home-result-list">
                                    {cards.map((card) => (
                                      <div
                                        key={`${card.outPath}-${card.sourceUrl}`}
                                        className="home-result-card"
                                      >
                                        <div className="home-result-card__thumb">
                                          {isImagePath(card.outPath) ? (
                                            <img src={toMediaUrl(card.outPath)} alt="" />
                                          ) : (
                                            <span className="home-result-card__kind">
                                              {(card.kind || "file").toUpperCase()}
                                            </span>
                                          )}
                                        </div>
                                        <div className="home-result-card__body">
                                          <div className="home-result-card__title">
                                            {card.title || fileNameFromPath(card.outPath)}
                                          </div>
                                          <div className="home-result-card__meta">
                                            Saved
                                            {card.kind ? ` · ${card.kind}` : ""}
                                            {card.provider ? ` · ${card.provider}` : ""}
                                          </div>
                                          <div className="home-result-card__actions">
                                            <Button
                                              size="mini"
                                              type="secondary"
                                              onClick={() =>
                                                void api.showItemInFolder(card.outPath)
                                              }
                                            >
                                              Show in folder
                                            </Button>
                                            <Button
                                              size="mini"
                                              type="text"
                                              onClick={() => void api.openPath(card.outPath)}
                                            >
                                              Open
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          {msg.role === "assistant" &&
                            extract &&
                            msg.status !== "detecting" &&
                            msg.status !== "done" &&
                            msg.status !== "started" &&
                            (extract.mode !== "single" || extract.itemCount > 1) &&
                            !(msg.results && msg.results.length > 0) && (
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
                                    <span>
                                      {extract.itemCount} item
                                      {extract.itemCount === 1 ? "" : "s"}
                                    </span>
                                    <span>·</span>
                                    <span>{extract.mode}</span>
                                    <span>·</span>
                                    <span>
                                      {extract.modeSupported ? "supported" : "not supported"}
                                    </span>
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
                              {showYoutubeConfirm && confirmFormat !== "audio-only" && (
                                <div className="home-chat-confirm__row">
                                  <span className="home-chat-confirm__label">Quality</span>
                                  <Select
                                    size="small"
                                    style={{ width: 140 }}
                                    value={confirmYtQuality}
                                    onChange={(v) => setConfirmYtQuality(v as YoutubeQuality)}
                                  >
                                    {(
                                      [
                                        "best",
                                        "2160",
                                        "1440",
                                        "1080",
                                        "720",
                                        "480",
                                        "360",
                                      ] as YoutubeQuality[]
                                    ).map((q) => (
                                      <Select.Option key={q} value={q}>
                                        {q === "best" ? "Best" : `${q}p`}
                                      </Select.Option>
                                    ))}
                                  </Select>
                                </div>
                              )}
                              {showYoutubeConfirm && confirmFormat === "audio-only" && (
                                <div className="home-chat-confirm__row">
                                  <span className="home-chat-confirm__label">Audio</span>
                                  <Select
                                    size="small"
                                    style={{ width: 140 }}
                                    value={confirmAudio}
                                    onChange={(v) => setConfirmAudio(v as AudioContainer)}
                                  >
                                    {(["m4a", "mp3", "flac"] as AudioContainer[]).map((a) => (
                                      <Select.Option key={a} value={a}>
                                        {a.toUpperCase()}
                                      </Select.Option>
                                    ))}
                                  </Select>
                                </div>
                              )}
                              {showYoutubeConfirm && (
                                <div className="home-chat-confirm__row">
                                  <span className="home-chat-confirm__label">Subtitles</span>
                                  <Select
                                    size="small"
                                    style={{ width: 140 }}
                                    value={confirmSubs}
                                    onChange={(v) => setConfirmSubs(v as SubtitleMode)}
                                  >
                                    <Select.Option value="none">None</Select.Option>
                                    <Select.Option value="separate">Separate file</Select.Option>
                                    <Select.Option value="embed">Embed</Select.Option>
                                  </Select>
                                </div>
                              )}
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
                <div className="chat-surface-fluid home-chat__sendbox-inner">{composer}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.guidLayout}>
          <div className={styles.heroHeader}>
            <p className="text-2xl font-semibold mb-0 text-t-primary text-center">
              Hi, what do you want to download?
            </p>
          </div>

          <PlatformSelectionBar value={filter} onChange={(id) => setFilter(id)} />

          {composer}

          <div className="mt-18px w-full pl-20px">
            <div className={`${styles.assistantPromptHint} mb-10px text-left`}>
              Try these example links:
            </div>
            <div className="flex flex-col gap-9px">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s.label}
                  type="text"
                  className="group !h-auto !w-full !border-none !bg-transparent !px-0 !py-6px !text-left !text-12.5px !text-t-secondary !whitespace-normal !break-words transition-colors hover:!bg-transparent hover:!text-t-primary"
                  onClick={() => applySuggestion(s)}
                >
                  <span>{s.label}</span>
                  <ArrowRightUp
                    theme="outline"
                    size="13"
                    className="ml-6px inline-flex flex-shrink-0 align-[-1px] text-t-primary opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function platformMetaFor(id: string) {
  return PLATFORMS.find((p: (typeof PLATFORMS)[number]) => p.id === id) ?? null;
}

function toMediaUrl(p: string): string {
  return `pinmedia://${p.replace(/\\/g, "/")}`;
}

function isImagePath(p: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(p);
}

function fileNameFromPath(p: string): string {
  return p.split(/[/\\]/).filter(Boolean).pop() || p;
}

export default DownloadPage;

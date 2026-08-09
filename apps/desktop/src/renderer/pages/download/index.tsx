import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Progress, Select, Spin, Switch } from "@arco-design/web-react";
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
  makeDownloadCards,
  coverUrlFromMediaUrl,
  isSelectableExtract,
  selectPendingConfirm,
  useHomeChatStore,
  type ChatDownloadCard,
  type ChatMessage,
} from "./homeChatStore";
import GuidHomeInputCard from "./guid/GuidHomeInputCard";
import GuidHomeActionRow from "./guid/GuidHomeActionRow";
import ExtractPickTable from "./ExtractPickTable";
import { resolveYoutubeExtractUrl, youtubeWatchHasList } from "./youtubeUrl";
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

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Pull one or more http(s) links from pasted text (newline / space separated). */
function parseMediaUrls(raw: string): string[] {
  const matches = raw.match(/https?:\/\/[^\s<>"'`]+/gi) ?? [];
  const cleaned = matches.map((u) => u.replace(/[),.;]+$/g, "").trim()).filter(Boolean);
  return [...new Set(cleaned)];
}

function urlsEqual(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\/+$/, "");
  return norm(a) === norm(b);
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
  const getPlaylistList = useHomeChatStore((s) => s.getPlaylistList);
  const setUrl = useHomeChatStore((s) => s.setUrl);
  const setFilter = useHomeChatStore((s) => s.setFilter);
  const setConfirmFormat = useHomeChatStore((s) => s.setConfirmFormat);
  const setConfirmEnhance = useHomeChatStore((s) => s.setConfirmEnhance);
  const setConfirmYtQuality = useHomeChatStore((s) => s.setConfirmYtQuality);
  const setConfirmAudio = useHomeChatStore((s) => s.setConfirmAudio);
  const setConfirmSubs = useHomeChatStore((s) => s.setConfirmSubs);
  const setExtracting = useHomeChatStore((s) => s.setExtracting);
  const setGetPlaylistList = useHomeChatStore((s) => s.setGetPlaylistList);
  const appendMessages = useHomeChatStore((s) => s.appendMessages);
  const mapMessages = useHomeChatStore((s) => s.mapMessages);
  const patchDownloadCard = useHomeChatStore((s) => s.patchDownloadCard);

  const [inputFocused, setInputFocused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [listMax, setListMax] = useState(50);
  const [listReloadingId, setListReloadingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const progressTargetRef = useRef<{ assistantId: string; activeUrl: string } | null>(
    null
  );

  const hasChat = messages.length > 0;
  const showProcessing = extracting || busy;

  useEffect(() => {
    if (settings) {
      setConfirmFormat(settings.format);
      setConfirmEnhance(settings.enhance);
      setConfirmYtQuality(settings.youtube?.quality ?? "best");
      setConfirmAudio(settings.youtube?.audioContainer ?? "m4a");
      setConfirmSubs(settings.youtube?.subtitles ?? "separate");
      setListMax(
        Math.max(
          settings.youtube?.playlistMaxVideos ?? 50,
          settings.youtube?.channelMaxVideos ?? 50
        )
      );
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
    return api.onMediaProgress((ev) => {
      const target = progressTargetRef.current;
      if (!target) return;
      const matchUrl = ev.url || target.activeUrl;
      if (!matchUrl) return;
      const percent =
        typeof ev.percent === "number"
          ? ev.percent
          : ev.total > 0
            ? Math.round((ev.current / ev.total) * 100)
            : undefined;
      const coverUrl =
        coverUrlFromMediaUrl(ev.url || "") ||
        coverUrlFromMediaUrl(matchUrl) ||
        undefined;
      const patch = {
        status: "downloading" as const,
        ...(ev.title ? { title: ev.title } : {}),
        ...(coverUrl ? { coverUrl } : {}),
        ...(typeof percent === "number" ? { percent } : {}),
        ...(ev.etaSec !== undefined ? { etaSec: ev.etaSec } : {}),
        ...(ev.phase ? { phase: ev.phase } : {}),
        ...(ev.message ? { message: ev.message } : {}),
        packId: ev.packId,
      };
      patchDownloadCard(target.assistantId, matchUrl, patch);
      // Also patch by activeUrl when IPC url differs slightly
      if (matchUrl !== target.activeUrl) {
        patchDownloadCard(target.assistantId, target.activeUrl, patch);
      }
    });
  }, [patchDownloadCard]);

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
    let okCount = 0;
    let failCount = 0;

    mapMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        const base =
          m.results && m.results.length > 0
            ? m.results
            : makeDownloadCards(urls, "queued");
        return {
          ...m,
          text:
            urls.length > 1
              ? `Downloading ${urls.length} items…`
              : `${(m.text || "").split("\n")[0]}\nStarting download…`,
          status: "started",
          results: base.map((c) =>
            urls.some((u) => urlsEqual(u, c.sourceUrl))
              ? { ...c, status: c.status === "done" ? "done" : "queued" }
              : c
          ),
        };
      })
    );

    for (let i = 0; i < urls.length; i++) {
      const targetUrl = urls[i];
      progressTargetRef.current = { assistantId: opts.assistantId, activeUrl: targetUrl };
      patchDownloadCard(opts.assistantId, targetUrl, {
        status: "downloading",
        percent: 0,
        etaSec: null,
        message: "Starting…",
      });
      mapMessages((prev) =>
        prev.map((m) =>
          m.id === opts.assistantId
            ? {
                ...m,
                text:
                  urls.length > 1
                    ? `Downloading ${i + 1} of ${urls.length}…`
                    : m.text,
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
        patchDownloadCard(opts.assistantId, targetUrl, {
          status: "failed",
          percent: undefined,
          etaSec: null,
          message: "Download failed",
          error: "Download failed",
        });
        continue;
      }

      // Board / multi-file under one URL → keep a single card with count
      const primary = res.results[0];
      patchDownloadCard(opts.assistantId, targetUrl, {
        status: "done",
        percent: 100,
        etaSec: 0,
        title: primary.title,
        outPath: primary.outPath,
        originalPath: primary.originalPath,
        provider: primary.provider ?? res.provider,
        kind: primary.kind,
        packId: res.packId,
        message:
          res.results.length > 1 ? `${res.results.length} files saved` : "Saved",
      });
      okCount += res.results.length;
    }

    progressTargetRef.current = null;

    if (okCount === 0) {
      mapMessages((prev) =>
        prev.map((m) =>
          m.id === opts.assistantId
            ? {
                ...m,
                text: "Download failed.",
                status: "failed",
              }
            : m
        )
      );
      return;
    }

    mapMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        const cards = m.results ?? [];
        const doneCards = cards.filter((c) => c.status === "done");
        return {
          ...m,
          text:
            urls.length > 1 || doneCards.length > 1
              ? `Download complete — ${okCount} saved${failCount ? `, ${failCount} failed` : ""}.`
              : "Download complete.",
          status: failCount && !okCount ? "failed" : "done",
          result: doneCards.length === 1 ? doneCards[0] : null,
          results: cards,
        };
      })
    );
  };

  const handleExtract = async (raw: string) => {
    const parsed = parseMediaUrls(raw);
    if (parsed.length === 0 || !settings.outDir || busy || extracting) return;

    const preferPlaylist = getPlaylistList;
    const urls = parsed.map((u) => resolveYoutubeExtractUrl(u, preferPlaylist));
    const displayText = raw.trim();
    setUrl("");
    setGetPlaylistList(false);
    setExtracting(true);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: displayText,
      url: urls[0],
    };
    const assistantId = uid();
    const seedCards = makeDownloadCards(urls, "extracting");
    const detectingMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      text:
        urls.length > 1
          ? `Found ${urls.length} links. Extracting…`
          : "Extracting source…",
      url: urls[0],
      status: "detecting",
      results: seedCards,
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
                results: (m.results ?? seedCards).map((c) => ({
                  ...c,
                  status: "failed" as const,
                  message: "Not supported",
                })),
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
    // Prefer first extract as message extract meta (mode chip)
    const extractForMsg: ExtractPreview = isBatch
      ? {
          ...primary,
          mode: "single",
          itemCount: downloadable.length,
          items: downloadable.map((e, i) => ({
            index: i + 1,
            url: e.sourceUrl,
            title: e.title ?? e.items[0]?.title,
            coverUrl:
              e.items.find((it) => it.coverUrl)?.coverUrl ||
              coverUrlFromMediaUrl(e.sourceUrl),
          })),
          message: replyText,
        }
      : primary;

    const selectable = isSelectableExtract(extractForMsg);
    const selectedItemUrls = selectable
      ? extractForMsg.items.map((i) => i.url)
      : undefined;
    // Profile / bulk: always pick from the list (skip auto-start of whole channel).
    const shouldAuto = autoDownload && !selectable;

    const downloadUrls = selectable
      ? extractForMsg.items.map((i) => i.url)
      : downloadable.map((e) => e.sourceUrl);

    const infoCards = selectable
      ? []
      : makeDownloadCards(
          downloadUrls,
          "ready",
          downloadable.map((e) => e.title ?? e.items[0]?.title),
          downloadable.map(
            (e) =>
              e.items.find((i) => i.coverUrl)?.coverUrl || coverUrlFromMediaUrl(e.sourceUrl)
          )
        );

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
                selectedItemUrls,
                results: infoCards,
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
              text: selectable
                ? `${replyText}\nSelect items below, then download.`
                : `${replyText}\nConfirm options below to start the download.`,
              detected,
              extract: extractForMsg,
              status: "ready",
              pendingConfirm: true,
              selectedItemUrls,
              results: infoCards,
            }
          : { ...m, pendingConfirm: false }
      )
    );
    setExtracting(false);
  };

  const confirmDownload = () => {
    const msg = pendingConfirmMsg;
    if (!msg?.detected?.live || !msg.extract) return;
    void beginSelectedDownload(msg);
  };

  const beginSelectedDownload = (
    msg: ChatMessage,
    onlyUrls?: string[]
  ) => {
    if (!msg.detected?.live || !msg.extract) return;

    const extract = msg.extract;
    const selectable = isSelectableExtract(extract);
    const selectedSet = new Set(
      (onlyUrls?.length
        ? onlyUrls
        : msg.selectedItemUrls?.length
          ? msg.selectedItemUrls
          : extract.items.map((i) => i.url)
      ).map((u) => u.trim())
    );
    const selectedItems = selectable
      ? extract.items.filter((i) => selectedSet.has(i.url.trim()))
      : [];

    const batchUrls = selectable
      ? [...new Set(selectedItems.map((i) => i.url))]
      : extract.itemCount > 1 && extract.items.length > 0
        ? [...new Set(extract.items.map((i) => i.url))]
        : msg.url
          ? [msg.url]
          : extract.sourceUrl
            ? [extract.sourceUrl]
            : [];
    if (batchUrls.length === 0) return;

    const cards = selectable
      ? makeDownloadCards(
          batchUrls,
          "queued",
          selectedItems.map((i) => i.title),
          selectedItems.map((i) => i.coverUrl || coverUrlFromMediaUrl(i.url))
        )
      : msg.results && msg.results.length > 0
        ? msg.results.map((c) =>
            batchUrls.some((u) => urlsEqual(u, c.sourceUrl))
              ? { ...c, status: "queued" as const }
              : c
          )
        : makeDownloadCards(batchUrls, "queued");

    mapMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              text: `${describeExtract(m.extract!)}\nDownload started (${batchUrls.length}).`,
              pendingConfirm: false,
              status: "started",
              results: cards,
            }
          : m
      )
    );
    void startDownload(batchUrls, {
      format: confirmFormat,
      enhance: msg.detected?.id === "pinterest" ? confirmEnhance : false,
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

  const setMessageSelection = (messageId: string, urls: string[]) => {
    mapMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, selectedItemUrls: urls } : m))
    );
  };

  const toggleMessageItem = (messageId: string, url: string) => {
    mapMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const cur = new Set(m.selectedItemUrls ?? []);
        if (cur.has(url)) cur.delete(url);
        else cur.add(url);
        return { ...m, selectedItemUrls: [...cur] };
      })
    );
  };

  const reloadExtractList = async (msg: ChatMessage, max: number) => {
    if (!msg.extract?.sourceUrl) return;
    const capped = Math.max(1, Math.min(500, max));
    setListMax(capped);
    setListReloadingId(msg.id);
    try {
      const mode = msg.extract.mode;
      const next = await api.extractPreview(msg.extract.sourceUrl, {
        channelMaxVideos: capped,
        playlistMaxVideos: capped,
      });
      const extract =
        mode === "playlist" || mode === "profile"
          ? { ...next, mode: mode as typeof next.mode }
          : next;
      const selectedItemUrls = extract.items.map((i) => i.url);
      mapMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                extract,
                selectedItemUrls,
                text: extract.message
                  ? `${extract.message}\nSelect items below, then download.`
                  : m.text,
                status: "ready",
                pendingConfirm: true,
              }
            : m
        )
      );
      if (msg.detected?.id === "youtube") {
        void updateSettings({
          youtube:
            mode === "playlist"
              ? { playlistMaxVideos: capped }
              : { channelMaxVideos: capped },
        });
      }
    } finally {
      setListReloadingId(null);
    }
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
      leftOptions={
        youtubeWatchHasList(url.trim()) ? (
          <label className="home-composer-playlist-opt">
            <Checkbox
              checked={getPlaylistList}
              disabled={busy || extracting}
              onChange={(checked) => setGetPlaylistList(checked)}
            />
            <span className="home-composer-playlist-opt__text">
              Get playlist
              <span className="home-composer-playlist-opt__hint">
                {getPlaylistList ? " · list" : " · this video"}
              </span>
            </span>
          </label>
        ) : null
      }
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
        onInputChange={(v) => {
          setUrl(v);
          if (!youtubeWatchHasList(v.trim()) && getPlaylistList) {
            setGetPlaylistList(false);
          }
        }}
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
            <div className="home-chat-layout flex flex-col flex-1 min-h-0 w-full max-w-full min-w-0 chat-surface-container px-16px overflow-x-hidden">
              <div className="home-chat flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-10px box-border">
                <div className="home-chat__thread chat-surface-fluid min-w-0 max-w-full">
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
                            const cards: ChatDownloadCard[] =
                              msg.results && msg.results.length > 0
                                ? msg.results
                                : msg.result
                                  ? [msg.result]
                                  : [];
                            const showCards =
                              msg.role === "assistant" && cards.length > 0;
                            const showText =
                              Boolean(msg.text) &&
                              (msg.role === "user" ||
                                msg.status === "ready" ||
                                msg.status === "error" ||
                                msg.status === "failed" ||
                                msg.status === "detecting" ||
                                (msg.status === "started" && cards.every((c) => !c.percent)));
                            return (
                              <>
                                {showText && (
                                  <div className="home-chat__text whitespace-pre-wrap">
                                    {msg.text}
                                  </div>
                                )}
                                {showCards && (
                                  <div className="home-result-list">
                                    {cards.map((card) => (
                                      <DownloadCard
                                        key={card.id || `${card.sourceUrl}-${card.status}`}
                                        card={card}
                                      />
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          {msg.role === "assistant" &&
                            extract &&
                            isSelectableExtract(extract) &&
                            msg.status !== "detecting" &&
                            msg.status !== "started" &&
                            msg.status !== "done" && (
                            <ExtractPickTable
                              messageId={msg.id}
                              extract={extract}
                              selectedUrls={msg.selectedItemUrls ?? []}
                              onSelectionChange={(urls) => setMessageSelection(msg.id, urls)}
                              onToggleUrl={(u) => toggleMessageItem(msg.id, u)}
                              format={confirmFormat}
                              formats={extract.formats?.length ? extract.formats : ["best", "mp4", "audio-only"]}
                              onFormatChange={setConfirmFormat}
                              showYoutube={msg.detected?.id === "youtube"}
                              ytQuality={confirmYtQuality}
                              onYtQualityChange={setConfirmYtQuality}
                              audio={confirmAudio}
                              onAudioChange={setConfirmAudio}
                              subs={confirmSubs}
                              onSubsChange={setConfirmSubs}
                              listMax={
                                extract.mode === "playlist"
                                  ? settings.youtube?.playlistMaxVideos ?? listMax
                                  : extract.mode === "profile"
                                    ? settings.youtube?.channelMaxVideos ?? listMax
                                    : listMax
                              }
                              onListMaxChange={setListMax}
                              onReloadList={(max) => reloadExtractList(msg, max)}
                              listLoading={listReloadingId === msg.id}
                              busy={busy}
                              onDownloadSelected={() => beginSelectedDownload(msg)}
                              onDownloadOne={(item) => beginSelectedDownload(msg, [item.url])}
                            />
                          )}

                          {msg.pendingConfirm &&
                            msg.detected?.live &&
                            extract?.modeSupported &&
                            !isSelectableExtract(extract) && (
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
                                  Download
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

function shortHostPath(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.length > 36 ? `${u.pathname.slice(0, 34)}…` : u.pathname;
    return `${host}${path === "/" ? "" : path}`;
  } catch {
    return url.length > 48 ? `${url.slice(0, 46)}…` : url;
  }
}

function formatEta(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "";
  if (sec < 60) return `${Math.max(1, Math.round(sec))}s left`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s left` : `${m}m left`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m left` : `${h}h left`;
}

function cardStatusLabel(card: ChatDownloadCard): string {
  switch (card.status) {
    case "extracting":
      return "Extracting…";
    case "queued":
      return "Queued";
    case "ready":
      return "Ready";
    case "downloading":
      if (card.phase === "mux") return "Merging…";
      if (card.phase === "convert") return "Converting…";
      if (typeof card.percent === "number") {
        const eta = formatEta(card.etaSec);
        return eta ? `${card.percent}% · ${eta}` : `${card.percent}%`;
      }
      return card.message || "Downloading…";
    case "done":
      return card.message || "Saved";
    case "failed":
      return "Failed";
    default:
      return "";
  }
}

const DownloadCard: React.FC<{ card: ChatDownloadCard }> = ({ card }) => {
  const [coverFailed, setCoverFailed] = useState(false);
  const title =
    card.title ||
    (card.outPath ? fileNameFromPath(card.outPath) : shortHostPath(card.sourceUrl));
  const showProgress =
    card.status === "downloading" ||
    card.status === "extracting" ||
    (card.status === "queued" && typeof card.percent === "number");
  const percent =
    card.status === "done"
      ? 100
      : typeof card.percent === "number"
        ? card.percent
        : card.status === "extracting"
          ? undefined
          : 0;
  const thumbSrc =
    (card.outPath && isImagePath(card.outPath) ? toMediaUrl(card.outPath) : undefined) ||
    card.coverUrl ||
    coverUrlFromMediaUrl(card.sourceUrl);

  useEffect(() => {
    setCoverFailed(false);
  }, [thumbSrc]);

  return (
    <div className={`home-result-card home-result-card--${card.status}`}>
      <div className="home-result-card__thumb">
        {thumbSrc && !coverFailed ? (
          <img
            src={thumbSrc}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <span className="home-result-card__kind">
            {(card.kind || (card.status === "done" ? "file" : "url")).toUpperCase()}
          </span>
        )}
      </div>
      <div className="home-result-card__body">
        <div className="home-result-card__title" title={title}>
          {title}
        </div>
        <div className="home-result-card__meta">
          <span className="home-result-card__status">{cardStatusLabel(card)}</span>
          {card.status === "done" && card.kind ? ` · ${card.kind}` : ""}
          {card.status === "done" && card.provider ? ` · ${card.provider}` : ""}
          {(card.status === "extracting" || card.status === "ready" || card.status === "queued") && (
            <span className="home-result-card__url"> · {shortHostPath(card.sourceUrl)}</span>
          )}
        </div>
        {showProgress && (
          <div className="home-result-card__progress">
            <Progress
              percent={typeof percent === "number" ? percent : card.status === "extracting" ? 30 : 0}
              showText={false}
              status={card.status === "failed" ? "error" : undefined}
              size="small"
            />
          </div>
        )}
        {card.status === "failed" && card.error && (
          <div className="home-result-card__error">{card.error}</div>
        )}
        {card.status === "done" && card.outPath && (
          <div className="home-result-card__actions">
            <Button
              size="mini"
              type="secondary"
              onClick={() => void api.showItemInFolder(card.outPath!)}
            >
              Show in folder
            </Button>
            <Button size="mini" type="text" onClick={() => void api.openPath(card.outPath!)}>
              Open
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DownloadPage;

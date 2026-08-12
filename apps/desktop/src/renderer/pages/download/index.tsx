import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Message, Select, Switch } from "@arco-design/web-react";
import { ArrowRightUp, Right } from "@icon-park/react";
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
  shouldShowExtractPick,
  formatBatchMessage,
  selectPendingConfirm,
  useHomeChatStore,
  type ChatDownloadCard,
  type ChatMessage,
  type ChatBatchJob,
} from "./homeChatStore";
import GuidHomeInputCard from "./guid/GuidHomeInputCard";
import GuidHomeActionRow from "./guid/GuidHomeActionRow";
import ExtractPickTable from "./ExtractPickTable";
import { resolveYoutubeExtractUrl, youtubeWatchHasList, isYouTubeUrl } from "./youtubeUrl";
import { youtubeQualityChoices } from "./youtubeQuality";
import ShimmerText from "@renderer/components/base/ShimmerText";
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
    return (
      extract.message ?? `Extracted ${extract.itemCount} items from ${extract.provider.label}.`
    );
  }
  return extract.message ?? `Detected ${extract.provider.label}. Ready to download.`;
}

const DownloadPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, busy, processUrl, updateSettings, queueUrls } = useApp();

  const url = useHomeChatStore((s) => s.url);
  const filter = useHomeChatStore((s) => s.filter);
  const messages = useHomeChatStore((s) => s.messages);
  const confirmFormat = useHomeChatStore((s) => s.confirmFormat);
  const confirmEnhance = useHomeChatStore((s) => s.confirmEnhance);
  const confirmYtQuality = useHomeChatStore((s) => s.confirmYtQuality);
  const confirmAudio = useHomeChatStore((s) => s.confirmAudio);
  const confirmSubs = useHomeChatStore((s) => s.confirmSubs);
  const confirmSaveVideo = useHomeChatStore((s) => s.confirmSaveVideo);
  const confirmSaveAudio = useHomeChatStore((s) => s.confirmSaveAudio);
  const confirmSaveThumbnail = useHomeChatStore((s) => s.confirmSaveThumbnail);
  const extracting = useHomeChatStore((s) => s.extracting);
  const getPlaylistList = useHomeChatStore((s) => s.getPlaylistList);
  const setUrl = useHomeChatStore((s) => s.setUrl);
  const setFilter = useHomeChatStore((s) => s.setFilter);
  const setConfirmFormat = useHomeChatStore((s) => s.setConfirmFormat);
  const setConfirmEnhance = useHomeChatStore((s) => s.setConfirmEnhance);
  const setConfirmYtQuality = useHomeChatStore((s) => s.setConfirmYtQuality);
  const setConfirmAudio = useHomeChatStore((s) => s.setConfirmAudio);
  const setConfirmSubs = useHomeChatStore((s) => s.setConfirmSubs);
  const setConfirmSaveVideo = useHomeChatStore((s) => s.setConfirmSaveVideo);
  const setConfirmSaveAudio = useHomeChatStore((s) => s.setConfirmSaveAudio);
  const setConfirmSaveThumbnail = useHomeChatStore((s) => s.setConfirmSaveThumbnail);
  const setExtracting = useHomeChatStore((s) => s.setExtracting);
  const setGetPlaylistList = useHomeChatStore((s) => s.setGetPlaylistList);
  const appendMessages = useHomeChatStore((s) => s.appendMessages);
  const mapMessages = useHomeChatStore((s) => s.mapMessages);
  const patchDownloadCard = useHomeChatStore((s) => s.patchDownloadCard);
  const patchBatchJob = useHomeChatStore((s) => s.patchBatchJob);

  const [inputFocused, setInputFocused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [listMax, setListMax] = useState(50);
  const [listReloadingId, setListReloadingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const scrollHideTimerRef = useRef<number | null>(null);
  const [chatFade, setChatFade] = useState({ top: false, bottom: false });
  const progressTargetRef = useRef<{ assistantId: string; activeUrl: string } | null>(null);
  const downloadQueueRef = useRef<Array<() => Promise<void>>>([]);
  const drainingQueueRef = useRef(false);

  const drainDownloadQueue = async () => {
    if (drainingQueueRef.current) return;
    drainingQueueRef.current = true;
    try {
      while (downloadQueueRef.current.length > 0) {
        const job = downloadQueueRef.current.shift();
        if (job) await job();
      }
    } finally {
      drainingQueueRef.current = false;
    }
  };

  const enqueueDownload = (job: () => Promise<void>) => {
    downloadQueueRef.current.push(job);
    void drainDownloadQueue();
  };

  const hasChat = messages.length > 0;
  // Composer chip only while extracting — batch progress lives in the chat pipeline.
  const showProcessing = extracting;

  useEffect(() => {
    if (settings) {
      setConfirmFormat(settings.format);
      setConfirmEnhance(settings.enhance);
      setConfirmYtQuality(settings.youtube?.quality ?? "best");
      setConfirmAudio(settings.youtube?.audioContainer ?? "m4a");
      setConfirmSubs(settings.youtube?.subtitles ?? "separate");
      setConfirmSaveVideo(settings.youtube?.saveVideo !== false);
      setConfirmSaveAudio(settings.youtube?.saveAudio !== false);
      setConfirmSaveThumbnail(settings.youtube?.saveThumbnail !== false);
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
    setConfirmSaveVideo,
    setConfirmSaveAudio,
    setConfirmSaveThumbnail,
  ]);

  const updateChatFade = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = dist < 96;
    setChatFade({
      top: el.scrollTop > 10,
      bottom: dist > 10,
    });
  };

  const onChatScroll = () => {
    updateChatFade();
    const el = chatScrollRef.current;
    if (!el) return;
    el.classList.add("is-scrolling");
    if (scrollHideTimerRef.current != null) {
      window.clearTimeout(scrollHideTimerRef.current);
    }
    scrollHideTimerRef.current = window.setTimeout(() => {
      el.classList.remove("is-scrolling");
      scrollHideTimerRef.current = null;
    }, 900);
  };

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current != null) {
        window.clearTimeout(scrollHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) {
      updateChatFade();
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    // Fade after layout settles
    requestAnimationFrame(updateChatFade);
  }, [messages, extracting, busy]);

  useEffect(() => {
    updateChatFade();
  }, [hasChat]);
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
        coverUrlFromMediaUrl(ev.url || "") || coverUrlFromMediaUrl(matchUrl) || undefined;
      const patch = {
        status: "downloading" as const,
        ...(ev.title ? { title: ev.title } : {}),
        ...(coverUrl ? { coverUrl } : {}),
        ...(typeof percent === "number" ? { percent } : {}),
        ...(ev.etaSec !== undefined ? { etaSec: ev.etaSec } : {}),
        ...(ev.speedBps !== undefined ? { speedBps: ev.speedBps } : {}),
        ...(ev.phase ? { phase: ev.phase } : {}),
        ...(ev.message ? { message: ev.message } : {}),
        packId: ev.packId,
      };
      patchDownloadCard(target.assistantId, matchUrl, patch);
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

  const pendingConfirmMsg = useMemo(() => selectPendingConfirm(messages), [messages]);

  if (!settings) {
    return <div className="text-t-secondary p-24px">Loading…</div>;
  }

  const autoDownload = settings.autoDownload !== false;
  // Allow pasting more links while a download runs; only block during extract.
  const canSubmit = url.trim().length > 0 && !!settings.outDir && !extracting;
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
      /** Multi-item: chat shows summary only; Tasks holds the file list. */
      asBatch?: boolean;
      batchLabel?: string;
    }
  ) => {
    const urls = Array.isArray(targetUrls) ? targetUrls : [targetUrls];
    const isBatch = opts.asBatch === true || urls.length > 1;
    let okCount = 0;
    let failCount = 0;

    const initialJob: ChatBatchJob | null = isBatch
      ? {
          total: urls.length,
          done: 0,
          failed: 0,
          current: 0,
          label: opts.batchLabel,
        }
      : null;

    mapMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        if (isBatch && initialJob) {
          return {
            ...m,
            text: formatBatchMessage({ ...m, status: "started" }, initialJob),
            status: "started",
            pendingConfirm: false,
            results: [],
            result: null,
            batchJob: initialJob,
          };
        }
        const base =
          m.results && m.results.length > 0 ? m.results : makeDownloadCards(urls, "queued");
        return {
          ...m,
          text: `${(m.text || "").split("\n")[0]}\nStarting download…`,
          status: "started",
          batchJob: null,
          results: base.map((c) =>
            urls.some((u) => urlsEqual(u, c.sourceUrl))
              ? { ...c, status: c.status === "done" ? "done" : "queued" }
              : c
          ),
        };
      })
    );

    try {
      for (let i = 0; i < urls.length; i++) {
        const targetUrl = urls[i];
        progressTargetRef.current = { assistantId: opts.assistantId, activeUrl: targetUrl };

        if (isBatch) {
          patchBatchJob(opts.assistantId, { current: i + 1 });
        } else {
          patchDownloadCard(opts.assistantId, targetUrl, {
            status: "downloading",
            percent: 0,
            etaSec: null,
            message: "Starting…",
          });
        }

        try {
          const res = await processUrl(targetUrl, {
            enhance: opts.enhance,
            format: opts.format,
            youtube: opts.youtube,
            notify: !isBatch,
          });

          if (!res || res.results.length === 0) {
            failCount += 1;
            if (isBatch) {
              patchBatchJob(opts.assistantId, {
                current: i + 1,
                failed: failCount,
                done: okCount,
              });
            } else {
              patchDownloadCard(opts.assistantId, targetUrl, {
                status: "failed",
                percent: undefined,
                etaSec: null,
                message: "Download failed",
                error: "Download failed",
              });
            }
            continue;
          }

          const primary = res.results[0];
          okCount += res.results.length;
          if (isBatch) {
            patchBatchJob(opts.assistantId, {
              current: i + 1,
              done: okCount,
              failed: failCount,
            });
          } else {
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
              message: res.results.length > 1 ? `${res.results.length} files saved` : "Saved",
            });
          }
        } catch (err) {
          failCount += 1;
          const errMsg = err instanceof Error ? err.message : String(err);
          if (isBatch) {
            patchBatchJob(opts.assistantId, {
              current: i + 1,
              failed: failCount,
              done: okCount,
            });
          } else {
            patchDownloadCard(opts.assistantId, targetUrl, {
              status: "failed",
              percent: undefined,
              etaSec: null,
              message: "Download failed",
              error: errMsg,
            });
          }
        }
      }
    } finally {
      progressTargetRef.current = null;
    }

    if (isBatch && settings.system?.notifications && settings.system.notifyOnDownloadComplete) {
      try {
        if (typeof Notification !== "undefined") {
          new Notification("Pinforge", {
            body:
              okCount === 0
                ? `Batch failed — ${failCount} item${failCount === 1 ? "" : "s"}`
                : `Batch done — ${okCount} saved${failCount ? `, ${failCount} failed` : ""}`,
          });
        }
      } catch {
        /* permission denied */
      }
    }

    mapMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        if (isBatch) {
          const batchJob: ChatBatchJob = {
            total: urls.length,
            done: okCount,
            failed: failCount,
            current: urls.length,
            label: opts.batchLabel || m.batchJob?.label,
          };
          const status = okCount === 0 ? "failed" : "done";
          return {
            ...m,
            status,
            results: [],
            result: null,
            batchJob,
            text: formatBatchMessage({ ...m, status }, batchJob),
          };
        }
        if (okCount === 0) {
          return { ...m, text: "Download failed.", status: "failed" };
        }
        const cards = m.results ?? [];
        const doneCards = cards.filter((c) => c.status === "done");
        return {
          ...m,
          text: "Download complete.",
          status: failCount && !okCount ? "failed" : "done",
          result: doneCards.length === 1 ? doneCards[0] : null,
          results: cards,
        };
      })
    );
  };

  const handleExtract = async (raw: string) => {
    const parsed = parseMediaUrls(raw);
    if (parsed.length === 0 || !settings.outDir || extracting) return;

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
      text: urls.length > 1 ? `Found ${urls.length} links. Extracting…` : "Extracting source…",
      url: urls[0],
      status: "detecting",
      results: seedCards,
    };
    appendMessages([userMsg, detectingMsg]);

    try {
      // Batch: probe first URL for formats/provider defaults, download all live singles
      const extracts: ExtractPreview[] = [];
      for (const u of urls) {
        try {
          extracts.push(
            await api.extractPreview(u, {
              preferPlaylist,
            })
          );
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
      setConfirmSaveVideo(settings.youtube?.saveVideo !== false);
      setConfirmSaveAudio(settings.youtube?.saveAudio !== false);
      setConfirmSaveThumbnail(settings.youtube?.saveThumbnail !== false);

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
                e.items.find((it) => it.coverUrl)?.coverUrl || coverUrlFromMediaUrl(e.sourceUrl),
            })),
            message: replyText,
          }
        : primary;

      const selectable = isSelectableExtract(extractForMsg);
      const selectedItemUrls = selectable ? extractForMsg.items.map((i) => i.url) : undefined;
      // Profile / bulk: always pick from the list (skip auto-start of whole channel).
      // Single YouTube: always confirm so the user can pick height quality.
      const shouldAuto =
        autoDownload &&
        !selectable &&
        !(detected.id === "youtube" && extractForMsg.mode === "single");

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
              (e) => e.items.find((i) => i.coverUrl)?.coverUrl || coverUrlFromMediaUrl(e.sourceUrl)
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
        enqueueDownload(() =>
          startDownload(downloadUrls, {
            format: nextFormat,
            enhance: settings.enhance,
            assistantId,
            asBatch: downloadUrls.length > 1 || selectable,
            batchLabel: selectable ? `${detected.label} · ${extractForMsg.mode}` : detected.label,
            youtube:
              detected.id === "youtube"
                ? {
                    quality: settings.youtube?.quality ?? "best",
                    audioContainer: settings.youtube?.audioContainer ?? "m4a",
                    subtitles: settings.youtube?.subtitles ?? "separate",
                    saveVideo: settings.youtube?.saveVideo !== false,
                    saveAudio: settings.youtube?.saveAudio !== false,
                    saveThumbnail: settings.youtube?.saveThumbnail !== false,
                  }
                : undefined,
          })
        );
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
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      mapMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: errMsg,
                status: "error",
                pendingConfirm: false,
                results: (m.results ?? seedCards).map((c) => ({
                  ...c,
                  status: "failed" as const,
                  message: errMsg,
                })),
              }
            : m
        )
      );
    } finally {
      setExtracting(false);
    }
  };

  const confirmDownload = () => {
    const msg = pendingConfirmMsg;
    if (!msg?.detected?.live || !msg.extract) return;
    void beginSelectedDownload(msg);
  };

  const beginSelectedDownload = (msg: ChatMessage, onlyUrls?: string[]) => {
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

    const asBatch = selectable || batchUrls.length > 1;
    const batchLabel = `${msg.detected?.label || "Download"} · ${extract.mode}`;
    const initialJob: ChatBatchJob | null = asBatch
      ? {
          total: batchUrls.length,
          done: 0,
          failed: 0,
          current: 0,
          label: batchLabel,
        }
      : null;

    mapMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              text:
                asBatch && initialJob
                  ? formatBatchMessage({ ...m, status: "started" }, initialJob)
                  : `${describeExtract(m.extract!)}\nDownload started.`,
              pendingConfirm: false,
              status: "started",
              results: asBatch
                ? []
                : msg.results && msg.results.length > 0
                  ? msg.results.map((c) =>
                      batchUrls.some((u) => urlsEqual(u, c.sourceUrl))
                        ? { ...c, status: "queued" as const }
                        : c
                    )
                  : makeDownloadCards(batchUrls, "queued"),
              result: null,
              batchJob: initialJob,
            }
          : m
      )
    );
    enqueueDownload(() =>
      startDownload(batchUrls, {
        format: confirmFormat,
        enhance: msg.detected?.id === "pinterest" ? confirmEnhance : false,
        assistantId: msg.id,
        asBatch,
        batchLabel,
        youtube:
          msg.detected?.id === "youtube"
            ? {
                quality: confirmYtQuality,
                audioContainer: confirmAudio,
                subtitles: confirmSubs,
                saveVideo: confirmSaveVideo,
                saveAudio: confirmSaveAudio,
                saveThumbnail: confirmSaveThumbnail,
              }
            : undefined,
      })
    );
    if (msg.detected?.id === "youtube") {
      void updateSettings({
        format: confirmFormat,
        youtube: {
          quality: confirmYtQuality,
          audioContainer: confirmAudio,
          subtitles: confirmSubs,
          saveVideo: confirmSaveVideo,
          saveAudio: confirmSaveAudio,
          saveThumbnail: confirmSaveThumbnail,
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
              status: "cancelled",
            }
          : m
      )
    );
  };

  const cancelExtractPick = (messageId: string) => {
    mapMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const head = m.extract ? describeExtract(m.extract).split("\n")[0] : m.text.split("\n")[0];
        return {
          ...m,
          status: "cancelled",
          text: `${head}\nCancelled. Paste another link when you're ready.`,
          selectedItemUrls: [],
        };
      })
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
    const isPin = msg.detected?.id === "pinterest";
    const capped = Math.max(1, Math.min(isPin ? 2000 : 500, max));
    setListMax(capped);
    setListReloadingId(msg.id);
    try {
      const mode = msg.extract.mode;
      const next = await api.extractPreview(msg.extract.sourceUrl, {
        channelMaxVideos: capped,
        playlistMaxVideos: capped,
        boardMaxPins: capped,
        preferPlaylist: mode === "playlist",
      });
      const extract =
        mode === "playlist" || mode === "profile" || mode === "board"
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
                text: extract.itemCount
                  ? extract.message
                    ? `${extract.message}\nSelect items below, then download.`
                    : m.text
                  : (extract.message ?? "No items found on this page."),
                status: extract.itemCount > 0 ? "ready" : "error",
                pendingConfirm: extract.itemCount > 0,
                ...(extract.itemCount <= 0
                  ? {
                      results: (m.results ?? []).map((c) => ({
                        ...c,
                        status: "failed" as const,
                        message: "Download failed",
                        error: extract.message ?? "No items found",
                      })),
                    }
                  : {}),
              }
            : m
        )
      );
      if (msg.detected?.id === "youtube") {
        void updateSettings({
          youtube:
            mode === "playlist" ? { playlistMaxVideos: capped } : { channelMaxVideos: capped },
        });
      } else if (isPin) {
        void updateSettings({ pinterest: { boardMaxPins: capped } });
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
      <span className="home-processing__text">
        <ShimmerText>Processing…</ShimmerText>
        <span className="home-processing__elapsed">({elapsedSec}s)</span>
      </span>
    </div>
  ) : null;

  const showEnhanceToolbar = filter === "auto" || filter === "pinterest";
  const trimmedUrl = url.trim();
  const showYoutubeTools = filter === "youtube" || isYouTubeUrl(trimmedUrl);
  const queueCount = settings?.pendingQueue?.length ?? 0;
  const clipboardMonitor = Boolean(settings?.clipboardMonitor);

  const handleQueueToTasks = async () => {
    const urls = parseMediaUrls(trimmedUrl);
    if (urls.length === 0) return;
    const added = await queueUrls(urls);
    if (added > 0) {
      Message.success(added === 1 ? "Added to Tasks queue" : `Added ${added} links to Tasks queue`);
    } else {
      Message.info("Already in Tasks queue");
    }
  };

  const actionRow = (
    <GuidHomeActionRow
      hasUrl={hasUrl}
      loading={extracting}
      disabled={!canSubmit}
      format={confirmFormat}
      enhance={confirmEnhance}
      showEnhance={showEnhanceToolbar}
      showYoutubeQuality={showYoutubeTools}
      youtubeQuality={confirmYtQuality}
      youtubeQualityChoices={youtubeQualityChoices()}
      onYoutubeQualityChange={(q) => {
        setConfirmYtQuality(q);
        void updateSettings({ youtube: { quality: q } });
      }}
      showSubtitles={showYoutubeTools}
      subtitles={confirmSubs}
      onSubtitlesChange={(mode) => {
        setConfirmSubs(mode);
        void updateSettings({ youtube: { subtitles: mode } });
      }}
      clipboardMonitor={clipboardMonitor}
      queueCount={queueCount}
      canQueue={hasUrl && Boolean(settings?.outDir?.trim())}
      onQueue={() => void handleQueueToTasks()}
      onOpenTasks={() => navigate("/tasks")}
      leftOptions={
        youtubeWatchHasList(url.trim()) ? (
          <label className="home-composer-playlist-opt">
            <Checkbox
              checked={getPlaylistList}
              disabled={extracting}
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
        disabled={extracting}
        actionRow={actionRow}
        workspaceDir={settings.outDir || ""}
        onSelectWorkspace={(dir) => void updateSettings({ outDir: dir })}
        textareaRef={textareaRef}
      />
    </div>
  );

  return (
    <div className={hasChat ? "home-hero flex flex-col h-full min-h-0" : styles.guidContainer}>
      {hasChat ? (
        <div className="home-hero__stage home-hero__stage--chat flex-1 min-h-0 flex flex-col">
          <div className="home-guid-layout home-guid-layout--chat w-full flex flex-col flex-1 min-h-0">
            <div className="home-chat-layout flex flex-col flex-1 min-h-0 w-full max-w-full min-w-0">
              <div className="home-chat__scroll-shell">
                <div
                  className={`home-chat__fade home-chat__fade--top${chatFade.top ? " is-visible" : ""}`}
                  aria-hidden
                />
                <div ref={chatScrollRef} className="home-chat" onScroll={onChatScroll}>
                  <div className="home-chat__thread home-chat__content min-w-0">
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
                                    meta ? { background: meta.tint, color: meta.accent } : undefined
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
                                  {msg.status === "detecting" ? (
                                    <ShimmerText>Extracting</ShimmerText>
                                  ) : msg.status === "started" ? (
                                    <ShimmerText>Downloading</ShimmerText>
                                  ) : msg.status === "done" ? (
                                    "Done"
                                  ) : msg.status === "failed" || msg.status === "error" ? (
                                    "Failed"
                                  ) : msg.status === "cancelled" ? (
                                    "Cancelled"
                                  ) : extract?.modeSupported ? (
                                    "Ready"
                                  ) : (
                                    "Unsupported"
                                  )}
                                </span>
                              </div>
                            )}
                            {(() => {
                              const cards: ChatDownloadCard[] = msg.batchJob
                                ? []
                                : msg.results && msg.results.length > 0
                                  ? msg.results
                                  : msg.result
                                    ? [msg.result]
                                    : [];
                              const showCards =
                                msg.role === "assistant" && cards.length > 0 && !msg.batchJob;
                              const showBatch = Boolean(msg.role === "assistant" && msg.batchJob);
                              // Batch: title + collapsible pipeline (no progress card).
                              const showText =
                                Boolean(msg.text) &&
                                !showBatch &&
                                (msg.role === "user" ||
                                  msg.status === "ready" ||
                                  msg.status === "error" ||
                                  msg.status === "failed" ||
                                  msg.status === "cancelled" ||
                                  msg.status === "detecting" ||
                                  msg.status === "started" ||
                                  msg.status === "done" ||
                                  (msg.status === "started" && cards.every((c) => !c.percent)));
                              return (
                                <>
                                  {showText && (
                                    <div className="home-chat__text whitespace-pre-wrap">
                                      {msg.text}
                                    </div>
                                  )}
                                  {showBatch && msg.batchJob && (
                                    <BatchPipeline
                                      job={msg.batchJob}
                                      status={msg.status}
                                      title={msg.text}
                                      onOpenTasks={() => navigate("/tasks")}
                                    />
                                  )}
                                  {showCards && (
                                    <div className="home-result-list">
                                      {cards.map((card) => (
                                        <DownloadPipeline
                                          key={card.id || `${card.sourceUrl}-${card.status}`}
                                          card={card}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </>
                              );
                            })()}

                            {shouldShowExtractPick(msg, extract) && extract && (
                              <ExtractPickTable
                                messageId={msg.id}
                                extract={extract}
                                selectedUrls={msg.selectedItemUrls ?? []}
                                onSelectionChange={(urls) => setMessageSelection(msg.id, urls)}
                                onToggleUrl={(u) => toggleMessageItem(msg.id, u)}
                                format={confirmFormat}
                                formats={
                                  extract.formats?.length
                                    ? extract.formats
                                    : ["best", "mp4", "audio-only"]
                                }
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
                                    ? (settings.youtube?.playlistMaxVideos ?? listMax)
                                    : extract.provider.id === "pinterest"
                                      ? (settings.pinterest?.boardMaxPins ?? listMax)
                                      : extract.mode === "profile"
                                        ? (settings.youtube?.channelMaxVideos ?? listMax)
                                        : listMax
                                }
                                onListMaxChange={setListMax}
                                onReloadList={(max) => reloadExtractList(msg, max)}
                                listLoading={listReloadingId === msg.id}
                                busy={false}
                                onDownloadSelected={() => beginSelectedDownload(msg)}
                                onDownloadOne={(item) => beginSelectedDownload(msg, [item.url])}
                                onCancel={() => cancelExtractPick(msg.id)}
                              />
                            )}

                            {msg.pendingConfirm &&
                              msg.detected?.live &&
                              extract?.modeSupported &&
                              !isSelectableExtract(extract) &&
                              msg.status !== "failed" &&
                              msg.status !== "error" &&
                              msg.status !== "cancelled" && (
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
                                        value={
                                          youtubeQualityChoices(extract.qualities).includes(
                                            confirmYtQuality
                                          )
                                            ? confirmYtQuality
                                            : "best"
                                        }
                                        onChange={(v) => setConfirmYtQuality(v as YoutubeQuality)}
                                      >
                                        {youtubeQualityChoices(extract.qualities).map((q) => (
                                          <Select.Option key={q} value={q}>
                                            {q === "best"
                                              ? extract.qualities?.[0]
                                                ? `Best (up to ${extract.qualities[0]}p)`
                                                : "Best (DASH streams)"
                                              : `${q}p`}
                                          </Select.Option>
                                        ))}
                                      </Select>
                                    </div>
                                  )}
                                  {showYoutubeConfirm &&
                                    extract.qualities &&
                                    extract.qualities.length > 0 && (
                                      <div className="home-chat-confirm__hint">
                                        Adaptive streams:{" "}
                                        {extract.qualities
                                          .slice(0, 6)
                                          .map((h) => `${h}p`)
                                          .join(" · ")}
                                        {extract.qualities.length > 6 ? " · …" : ""}
                                        {" · ffmpeg merges video + audio"}
                                      </div>
                                    )}
                                  {showYoutubeConfirm && (
                                    <div className="home-chat-confirm__row home-chat-confirm__row--assets">
                                      <span className="home-chat-confirm__label">Save</span>
                                      <div className="home-chat-confirm__checks">
                                        {confirmFormat !== "audio-only" && (
                                          <Checkbox
                                            checked={confirmSaveVideo}
                                            onChange={setConfirmSaveVideo}
                                          >
                                            Video
                                          </Checkbox>
                                        )}
                                        <Checkbox
                                          checked={
                                            confirmFormat === "audio-only" ? true : confirmSaveAudio
                                          }
                                          disabled={confirmFormat === "audio-only"}
                                          onChange={setConfirmSaveAudio}
                                        >
                                          Audio
                                        </Checkbox>
                                        <Checkbox
                                          checked={confirmSaveThumbnail}
                                          onChange={setConfirmSaveThumbnail}
                                        >
                                          Thumbnail
                                        </Checkbox>
                                        <Checkbox
                                          checked={confirmSubs !== "none"}
                                          onChange={(v) => setConfirmSubs(v ? "separate" : "none")}
                                        >
                                          Subtitles
                                        </Checkbox>
                                      </div>
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
                                  {showYoutubeConfirm && confirmSubs !== "none" && (
                                    <div className="home-chat-confirm__row">
                                      <span className="home-chat-confirm__label">Subtitles</span>
                                      <Select
                                        size="small"
                                        style={{ width: 140 }}
                                        value={confirmSubs}
                                        onChange={(v) => setConfirmSubs(v as SubtitleMode)}
                                      >
                                        <Select.Option value="separate">
                                          Separate file
                                        </Select.Option>
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
                                    <Button type="primary" size="small" onClick={confirmDownload}>
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
                <div
                  className={`home-chat__fade home-chat__fade--bottom${chatFade.bottom ? " is-visible" : ""}`}
                  aria-hidden
                />
              </div>

              <div className="home-chat__sendbox shrink-0 safe-area-bottom">
                <div className="home-chat__content home-chat__sendbox-inner">{composer}</div>
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

function BatchPipeline({
  job,
  status,
  title,
  onOpenTasks,
}: {
  job: ChatBatchJob;
  status?: ChatMessage["status"];
  title?: string;
  onOpenTasks: () => void;
}) {
  const running = status === "started";
  const failed = status === "failed";
  const [open, setOpen] = useState(running);

  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);

  const cur = Math.min(Math.max(job.current, 0), job.total);
  const summary = running
    ? `Downloading ${cur} of ${job.total}`
    : failed
      ? `Failed — ${job.failed || job.total} item${(job.failed || job.total) === 1 ? "" : "s"}`
      : `Finished — ${job.done} saved${job.failed ? `, ${job.failed} failed` : ""}`;

  return (
    <div className="home-pipeline">
      {title ? <div className="home-pipeline__title">{title}</div> : null}
      <button
        type="button"
        className="home-pipeline__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Right
          theme="outline"
          size="12"
          fill="currentColor"
          strokeWidth={3}
          className={`home-pipeline__chevron${open ? " is-open" : ""}`}
        />
        <span className="home-pipeline__summary">
          {running ? <ShimmerText>{summary}</ShimmerText> : summary}
        </span>
      </button>
      {open ? (
        <div className="home-pipeline__body">
          {job.label ? <div className="home-pipeline__line">{job.label}</div> : null}
          {running ? (
            <div className="home-pipeline__line">
              Progress is on Tasks — paste more links anytime
            </div>
          ) : (
            <div className="home-pipeline__line">Files are listed on Tasks</div>
          )}
          <button type="button" className="home-pipeline__link" onClick={onOpenTasks}>
            Open Tasks
          </button>
        </div>
      ) : null}
    </div>
  );
}

function platformMetaFor(id: string) {
  return PLATFORMS.find((p: (typeof PLATFORMS)[number]) => p.id === id) ?? null;
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

function formatSpeed(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps) || bps <= 0) return "";
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  const units = ["KB", "MB", "GB"];
  let v = bps / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}/s`;
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
        const speed =
          typeof card.speedBps === "number" && card.speedBps > 0 ? formatSpeed(card.speedBps) : "";
        const eta = formatEta(card.etaSec);
        const parts = [`${card.percent}%`];
        if (speed) parts.push(speed);
        if (eta) parts.push(eta);
        return parts.join(" · ");
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

function downloadPipelineSummary(card: ChatDownloadCard, title: string): string {
  const short = title.length > 42 ? `${title.slice(0, 40)}…` : title;
  switch (card.status) {
    case "extracting":
      return `Extracting · ${short}`;
    case "queued":
      return `Queued · ${short}`;
    case "ready":
      return `Ready · ${short}`;
    case "downloading": {
      if (typeof card.percent === "number") return `Downloading ${card.percent}% · ${short}`;
      if (card.phase === "mux") return `Merging · ${short}`;
      if (card.phase === "convert") return `Converting · ${short}`;
      return `Downloading · ${short}`;
    }
    case "done":
      return `Saved · ${short}`;
    case "failed":
      return `Failed · ${short}`;
    default:
      return short;
  }
}

const DownloadPipeline: React.FC<{ card: ChatDownloadCard }> = ({ card }) => {
  const title =
    card.title || (card.outPath ? fileNameFromPath(card.outPath) : shortHostPath(card.sourceUrl));
  const active =
    card.status === "downloading" ||
    card.status === "extracting" ||
    card.status === "queued" ||
    card.status === "ready";
  const failed = card.status === "failed";
  const [open, setOpen] = useState(active || failed);

  useEffect(() => {
    if (active || failed) setOpen(true);
  }, [active, failed]);

  const metaParts: string[] = [];
  if (card.status === "done") {
    metaParts.push(cardStatusLabel(card));
    if (card.kind) metaParts.push(card.kind);
    if (card.provider) metaParts.push(card.provider);
  } else if (active) {
    metaParts.push(cardStatusLabel(card));
    metaParts.push(shortHostPath(card.sourceUrl));
  } else if (failed) {
    metaParts.push(card.error || "Download failed");
  }

  return (
    <div className={`home-pipeline home-pipeline--result home-pipeline--${card.status}`}>
      <button
        type="button"
        className="home-pipeline__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Right
          theme="outline"
          size="12"
          fill="currentColor"
          strokeWidth={3}
          className={`home-pipeline__chevron${open ? " is-open" : ""}`}
        />
        <span className="home-pipeline__summary">
          {active ? (
            <ShimmerText>{downloadPipelineSummary(card, title)}</ShimmerText>
          ) : (
            downloadPipelineSummary(card, title)
          )}
        </span>
      </button>
      {open ? (
        <div className="home-pipeline__body">
          {metaParts.length > 0 ? (
            <div className="home-pipeline__line">{metaParts.join(" · ")}</div>
          ) : null}
          {failed && card.error && metaParts[0] !== card.error ? (
            <div className="home-pipeline__line home-pipeline__line--error">{card.error}</div>
          ) : null}
          {card.status === "done" && card.outPath ? (
            <div className="home-pipeline__actions">
              <button
                type="button"
                className="home-pipeline__link"
                onClick={() => void api.showItemInFolder(card.outPath!)}
              >
                Show in folder
              </button>
              <button
                type="button"
                className="home-pipeline__link"
                onClick={() => void api.openPath(card.outPath!)}
              >
                Open
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default DownloadPage;

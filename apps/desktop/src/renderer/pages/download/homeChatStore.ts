import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AudioContainer,
  DetectedProvider,
  ExtractPreview,
  FormatPreset,
  SubtitleMode,
  YoutubeQuality,
} from "@renderer/api";
import type { PlatformFilter } from "./PlatformSelectionBar";

export type ChatRole = "user" | "assistant";

export type ChatDownloadCardStatus =
  "queued" | "extracting" | "ready" | "downloading" | "done" | "failed";

export type ChatDownloadCard = {
  id: string;
  sourceUrl: string;
  title?: string;
  /** Remote or local preview image. */
  coverUrl?: string;
  status: ChatDownloadCardStatus;
  percent?: number;
  etaSec?: number | null;
  speedBps?: number | null;
  phase?: string;
  message?: string;
  outPath?: string;
  originalPath?: string;
  provider?: string;
  kind?: string;
  packId?: string;
  error?: string;
};

/** @deprecated Prefer ChatDownloadCard — kept for older call sites. */
export type ChatDownloadResult = ChatDownloadCard;

export type ChatBatchJob = {
  total: number;
  done: number;
  failed: number;
  current: number;
  /** Provider / mode label for the summary line. */
  label?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  url?: string;
  detected?: DetectedProvider | null;
  extract?: ExtractPreview | null;
  status?: "detecting" | "ready" | "error" | "started" | "done" | "failed" | "cancelled";
  pendingConfirm?: boolean;
  /** Selected extract item URLs for profile / bulk pick-download. */
  selectedItemUrls?: string[];
  /** Single-item download result card (shown when done). */
  result?: ChatDownloadCard | null;
  /** Single-item cards only — batch jobs use `batchJob` + Tasks instead. */
  results?: ChatDownloadCard[];
  /** Multi-item download progress summary (Tasks page holds the file list). */
  batchJob?: ChatBatchJob | null;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  url: string;
  filter: PlatformFilter;
  confirmFormat: FormatPreset;
  confirmEnhance: boolean;
  confirmYtQuality: YoutubeQuality;
  confirmAudio: AudioContainer;
  confirmSubs: SubtitleMode;
  confirmSaveVideo: boolean;
  confirmSaveAudio: boolean;
  confirmSaveThumbnail: boolean;
  getPlaylistList: boolean;
};

type LiveChatFields = {
  url: string;
  filter: PlatformFilter;
  messages: ChatMessage[];
  confirmFormat: FormatPreset;
  confirmEnhance: boolean;
  confirmYtQuality: YoutubeQuality;
  confirmAudio: AudioContainer;
  confirmSubs: SubtitleMode;
  confirmSaveVideo: boolean;
  confirmSaveAudio: boolean;
  confirmSaveThumbnail: boolean;
  extracting: boolean;
  getPlaylistList: boolean;
};

type HomeChatState = LiveChatFields & {
  activeId: string | null;
  sessions: ChatSession[];

  setUrl: (url: string) => void;
  setFilter: (filter: PlatformFilter) => void;
  setConfirmFormat: (format: FormatPreset) => void;
  setConfirmEnhance: (enhance: boolean) => void;
  setConfirmYtQuality: (quality: YoutubeQuality) => void;
  setConfirmAudio: (audio: AudioContainer) => void;
  setConfirmSubs: (subs: SubtitleMode) => void;
  setConfirmSaveVideo: (save: boolean) => void;
  setConfirmSaveAudio: (save: boolean) => void;
  setConfirmSaveThumbnail: (save: boolean) => void;
  setExtracting: (extracting: boolean) => void;
  setGetPlaylistList: (getPlaylistList: boolean) => void;
  appendMessages: (messages: ChatMessage[]) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  mapMessages: (fn: (messages: ChatMessage[]) => ChatMessage[]) => void;
  patchDownloadCard: (
    messageId: string,
    matchUrl: string,
    patch: Partial<ChatDownloadCard>
  ) => void;
  patchBatchJob: (messageId: string, patch: Partial<ChatBatchJob>) => void;
  clearConfirmPending: () => void;
  /** Start a blank workspace; keeps prior chats in history when they have messages. */
  newChat: () => void;
  /** Restore a saved session into the Home workspace. */
  openChat: (id: string) => void;
  removeChat: (id: string) => void;
  resetChat: () => void;
};

const MAX_SESSIONS = 40;

const liveDefaults: LiveChatFields = {
  url: "",
  filter: "auto",
  messages: [],
  confirmFormat: "best",
  confirmEnhance: true,
  confirmYtQuality: "best",
  confirmAudio: "m4a",
  confirmSubs: "separate",
  confirmSaveVideo: true,
  confirmSaveAudio: true,
  confirmSaveThumbnail: true,
  extracting: false,
  getPlaylistList: false,
};

function makeSessionId() {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function chatSessionTitle(messages: ChatMessage[]): string {
  const user = messages.find((m) => m.role === "user");
  const raw = (user?.text || user?.url || "").trim() || "New chat";
  const oneLine = raw.replace(/\s+/g, " ");
  return oneLine.length > 42 ? `${oneLine.slice(0, 40)}…` : oneLine;
}

function urlsMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\/+$/, "");
  return norm(a) === norm(b);
}

function snapshotFromLive(s: LiveChatFields & { activeId: string | null }): ChatSession | null {
  if (!s.messages.length) return null;
  const id = s.activeId || makeSessionId();
  const now = Date.now();
  return {
    id,
    title: chatSessionTitle(s.messages),
    createdAt: now,
    updatedAt: now,
    messages: s.messages,
    url: s.url,
    filter: s.filter,
    confirmFormat: s.confirmFormat,
    confirmEnhance: s.confirmEnhance,
    confirmYtQuality: s.confirmYtQuality,
    confirmAudio: s.confirmAudio,
    confirmSubs: s.confirmSubs,
    confirmSaveVideo: s.confirmSaveVideo,
    confirmSaveAudio: s.confirmSaveAudio,
    confirmSaveThumbnail: s.confirmSaveThumbnail,
    getPlaylistList: s.getPlaylistList,
  };
}

function upsertSession(sessions: ChatSession[], next: ChatSession): ChatSession[] {
  const prev = sessions.find((x) => x.id === next.id);
  const merged: ChatSession = {
    ...next,
    createdAt: prev?.createdAt ?? next.createdAt,
    updatedAt: Date.now(),
    title: next.messages.length ? chatSessionTitle(next.messages) : prev?.title || next.title,
  };
  const rest = sessions.filter((x) => x.id !== merged.id);
  return [merged, ...rest].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
}

function withSyncedSession(
  s: HomeChatState,
  live: Partial<LiveChatFields>
): Partial<HomeChatState> {
  const merged: LiveChatFields & { activeId: string | null } = {
    url: live.url ?? s.url,
    filter: live.filter ?? s.filter,
    messages: live.messages ?? s.messages,
    confirmFormat: live.confirmFormat ?? s.confirmFormat,
    confirmEnhance: live.confirmEnhance ?? s.confirmEnhance,
    confirmYtQuality: live.confirmYtQuality ?? s.confirmYtQuality,
    confirmAudio: live.confirmAudio ?? s.confirmAudio,
    confirmSubs: live.confirmSubs ?? s.confirmSubs,
    confirmSaveVideo: live.confirmSaveVideo ?? s.confirmSaveVideo,
    confirmSaveAudio: live.confirmSaveAudio ?? s.confirmSaveAudio,
    confirmSaveThumbnail: live.confirmSaveThumbnail ?? s.confirmSaveThumbnail,
    extracting: live.extracting ?? s.extracting,
    getPlaylistList: live.getPlaylistList ?? s.getPlaylistList,
    activeId: s.activeId,
  };

  if (!merged.messages.length) {
    return { ...live };
  }

  const snap = snapshotFromLive(merged);
  if (!snap) return { ...live };

  return {
    ...live,
    activeId: snap.id,
    sessions: upsertSession(s.sessions, snap),
  };
}

export const useHomeChatStore = create<HomeChatState>()(
  persist(
    (set, get) => ({
      ...liveDefaults,
      activeId: null,
      sessions: [],

      setUrl: (url) => set({ url }),
      setFilter: (filter) => set({ filter }),
      setConfirmFormat: (confirmFormat) => set({ confirmFormat }),
      setConfirmEnhance: (confirmEnhance) => set({ confirmEnhance }),
      setConfirmYtQuality: (confirmYtQuality) => set({ confirmYtQuality }),
      setConfirmAudio: (confirmAudio) => set({ confirmAudio }),
      setConfirmSubs: (confirmSubs) => set({ confirmSubs }),
      setConfirmSaveVideo: (confirmSaveVideo) => set({ confirmSaveVideo }),
      setConfirmSaveAudio: (confirmSaveAudio) => set({ confirmSaveAudio }),
      setConfirmSaveThumbnail: (confirmSaveThumbnail) => set({ confirmSaveThumbnail }),
      setExtracting: (extracting) => set({ extracting }),
      setGetPlaylistList: (getPlaylistList) => set({ getPlaylistList }),

      appendMessages: (messages) =>
        set((s) => withSyncedSession(s, { messages: [...s.messages, ...messages] })),

      updateMessage: (id, patch) =>
        set((s) =>
          withSyncedSession(s, {
            messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
          })
        ),

      mapMessages: (fn) => set((s) => withSyncedSession(s, { messages: fn(s.messages) })),

      patchDownloadCard: (messageId, matchUrl, patch) =>
        set((s) =>
          withSyncedSession(s, {
            messages: s.messages.map((m) => {
              if (m.id !== messageId || !m.results?.length) return m;
              const results = m.results.map((card) =>
                urlsMatch(card.sourceUrl, matchUrl) ? { ...card, ...patch } : card
              );
              const doneOne = results.length === 1 ? results[0] : null;
              return {
                ...m,
                results,
                result: doneOne?.status === "done" ? doneOne : m.result,
              };
            }),
          })
        ),

      patchBatchJob: (messageId, patch) =>
        set((s) =>
          withSyncedSession(s, {
            messages: s.messages.map((m) => {
              if (m.id !== messageId || !m.batchJob) return m;
              const batchJob = { ...m.batchJob, ...patch };
              return {
                ...m,
                batchJob,
                text: formatBatchMessage(m, batchJob),
              };
            }),
          })
        ),

      clearConfirmPending: () =>
        set((s) =>
          withSyncedSession(s, {
            messages: s.messages.map((m) =>
              m.pendingConfirm ? { ...m, pendingConfirm: false } : m
            ),
          })
        ),

      newChat: () => {
        const s = get();
        let sessions = s.sessions;
        if (s.messages.length) {
          const snap = snapshotFromLive(s);
          if (snap) sessions = upsertSession(sessions, snap);
        }
        set({
          ...liveDefaults,
          activeId: makeSessionId(),
          sessions,
          // keep last confirm prefs from previous chat
          confirmFormat: s.confirmFormat,
          confirmEnhance: s.confirmEnhance,
          confirmYtQuality: s.confirmYtQuality,
          confirmAudio: s.confirmAudio,
          confirmSubs: s.confirmSubs,
          confirmSaveVideo: s.confirmSaveVideo,
          confirmSaveAudio: s.confirmSaveAudio,
          confirmSaveThumbnail: s.confirmSaveThumbnail,
        });
      },

      openChat: (id) => {
        const s = get();
        const session = s.sessions.find((x) => x.id === id);
        if (!session) return;
        // Persist current workspace first if it has content and isn't the same id
        let sessions = s.sessions;
        if (s.messages.length && s.activeId && s.activeId !== id) {
          const snap = snapshotFromLive(s);
          if (snap) sessions = upsertSession(sessions, snap);
        }
        set({
          activeId: session.id,
          sessions,
          url: session.url,
          filter: session.filter,
          messages: session.messages,
          confirmFormat: session.confirmFormat,
          confirmEnhance: session.confirmEnhance,
          confirmYtQuality: session.confirmYtQuality,
          confirmAudio: session.confirmAudio,
          confirmSubs: session.confirmSubs,
          confirmSaveVideo: session.confirmSaveVideo ?? true,
          confirmSaveAudio: session.confirmSaveAudio ?? true,
          confirmSaveThumbnail: session.confirmSaveThumbnail ?? true,
          getPlaylistList: session.getPlaylistList,
          extracting: false,
        });
      },

      removeChat: (id) =>
        set((s) => {
          const sessions = s.sessions.filter((x) => x.id !== id);
          if (s.activeId !== id) return { sessions };
          return {
            ...liveDefaults,
            activeId: makeSessionId(),
            sessions,
            confirmFormat: s.confirmFormat,
            confirmEnhance: s.confirmEnhance,
            confirmYtQuality: s.confirmYtQuality,
            confirmAudio: s.confirmAudio,
            confirmSubs: s.confirmSubs,
            confirmSaveVideo: s.confirmSaveVideo,
            confirmSaveAudio: s.confirmSaveAudio,
            confirmSaveThumbnail: s.confirmSaveThumbnail,
          };
        }),

      resetChat: () => {
        const s = get();
        set({
          ...liveDefaults,
          activeId: makeSessionId(),
          sessions: s.sessions,
          confirmFormat: s.confirmFormat,
          confirmEnhance: s.confirmEnhance,
          confirmYtQuality: s.confirmYtQuality,
          confirmAudio: s.confirmAudio,
          confirmSubs: s.confirmSubs,
          confirmSaveVideo: s.confirmSaveVideo,
          confirmSaveAudio: s.confirmSaveAudio,
          confirmSaveThumbnail: s.confirmSaveThumbnail,
        });
      },
    }),
    {
      name: "pinforge:home-chat",
      partialize: (s) => ({
        activeId: s.activeId,
        sessions: s.sessions,
        url: s.url,
        filter: s.filter,
        messages: s.messages,
        confirmFormat: s.confirmFormat,
        confirmEnhance: s.confirmEnhance,
        confirmYtQuality: s.confirmYtQuality,
        confirmAudio: s.confirmAudio,
        confirmSubs: s.confirmSubs,
        confirmSaveVideo: s.confirmSaveVideo,
        confirmSaveAudio: s.confirmSaveAudio,
        confirmSaveThumbnail: s.confirmSaveThumbnail,
        getPlaylistList: s.getPlaylistList,
      }),
    }
  )
);

/** Sessions with messages, newest first (for sidebar). */
export function selectRecentChats(sessions: ChatSession[], limit = 12): ChatSession[] {
  return sessions
    .filter((s) => s.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function selectPendingConfirm(messages: ChatMessage[]) {
  return messages.find((m) => m.pendingConfirm && m.status === "ready");
}

/** Profile / playlist / board / multi-item extracts that need a pick list. */
export function isSelectableExtract(extract: ExtractPreview | null | undefined): boolean {
  if (!extract?.modeSupported) return false;
  if (extract.mode === "profile" || extract.mode === "playlist" || extract.mode === "board") {
    return true;
  }
  return extract.itemCount > 1;
}

export function formatBatchMessage(
  msg: Pick<ChatMessage, "extract" | "detected" | "status">,
  job: ChatBatchJob
): string {
  const kind = job.label || msg.extract?.mode || msg.detected?.label || "batch";
  const title = msg.extract?.title?.trim();
  return title ? `${title} · ${kind}` : kind;
}

export function makeDownloadCards(
  urls: string[],
  status: ChatDownloadCardStatus = "queued",
  titles?: Array<string | undefined>,
  covers?: Array<string | undefined>
): ChatDownloadCard[] {
  return urls.map((sourceUrl, i) => ({
    id: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    sourceUrl,
    title: titles?.[i],
    coverUrl: covers?.[i] || coverUrlFromMediaUrl(sourceUrl),
    status,
  }));
}

/** Best-effort YouTube (and similar) cover from a media URL. */
export function coverUrlFromMediaUrl(url: string): string | undefined {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://i.ytimg.com/vi/${v}/hqdefault.jpg`;
      const shorts = u.pathname.match(/\/shorts\/([\w-]+)/i)?.[1];
      if (shorts) return `https://i.ytimg.com/vi/${shorts}/hqdefault.jpg`;
      const embed = u.pathname.match(/\/embed\/([\w-]+)/i)?.[1];
      if (embed) return `https://i.ytimg.com/vi/${embed}/hqdefault.jpg`;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

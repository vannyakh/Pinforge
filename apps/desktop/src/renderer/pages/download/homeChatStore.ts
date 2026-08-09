import { create } from "zustand";
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
  | "queued"
  | "extracting"
  | "ready"
  | "downloading"
  | "done"
  | "failed";

export type ChatDownloadCard = {
  id: string;
  sourceUrl: string;
  title?: string;
  status: ChatDownloadCardStatus;
  percent?: number;
  etaSec?: number | null;
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

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  url?: string;
  detected?: DetectedProvider | null;
  extract?: ExtractPreview | null;
  status?: "detecting" | "ready" | "error" | "started" | "done" | "failed";
  pendingConfirm?: boolean;
  /** Single-item download result card (shown when done). */
  result?: ChatDownloadCard | null;
  /** Download / extract cards (list). */
  results?: ChatDownloadCard[];
};

type HomeChatState = {
  url: string;
  filter: PlatformFilter;
  messages: ChatMessage[];
  confirmFormat: FormatPreset;
  confirmEnhance: boolean;
  confirmYtQuality: YoutubeQuality;
  confirmAudio: AudioContainer;
  confirmSubs: SubtitleMode;
  extracting: boolean;

  setUrl: (url: string) => void;
  setFilter: (filter: PlatformFilter) => void;
  setConfirmFormat: (format: FormatPreset) => void;
  setConfirmEnhance: (enhance: boolean) => void;
  setConfirmYtQuality: (quality: YoutubeQuality) => void;
  setConfirmAudio: (audio: AudioContainer) => void;
  setConfirmSubs: (subs: SubtitleMode) => void;
  setExtracting: (extracting: boolean) => void;
  appendMessages: (messages: ChatMessage[]) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  mapMessages: (fn: (messages: ChatMessage[]) => ChatMessage[]) => void;
  patchDownloadCard: (
    messageId: string,
    matchUrl: string,
    patch: Partial<ChatDownloadCard>
  ) => void;
  clearConfirmPending: () => void;
  resetChat: () => void;
};

const initialState = {
  url: "",
  filter: "auto" as PlatformFilter,
  messages: [] as ChatMessage[],
  confirmFormat: "best" as FormatPreset,
  confirmEnhance: true,
  confirmYtQuality: "best" as YoutubeQuality,
  confirmAudio: "m4a" as AudioContainer,
  confirmSubs: "separate" as SubtitleMode,
  extracting: false,
};

function urlsMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\/+$/, "");
  return norm(a) === norm(b);
}

export const useHomeChatStore = create<HomeChatState>((set) => ({
  ...initialState,

  setUrl: (url) => set({ url }),
  setFilter: (filter) => set({ filter }),
  setConfirmFormat: (confirmFormat) => set({ confirmFormat }),
  setConfirmEnhance: (confirmEnhance) => set({ confirmEnhance }),
  setConfirmYtQuality: (confirmYtQuality) => set({ confirmYtQuality }),
  setConfirmAudio: (confirmAudio) => set({ confirmAudio }),
  setConfirmSubs: (confirmSubs) => set({ confirmSubs }),
  setExtracting: (extracting) => set({ extracting }),

  appendMessages: (messages) =>
    set((s) => ({ messages: [...s.messages, ...messages] })),

  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  mapMessages: (fn) => set((s) => ({ messages: fn(s.messages) })),

  patchDownloadCard: (messageId, matchUrl, patch) =>
    set((s) => ({
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
    })),

  clearConfirmPending: () =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.pendingConfirm ? { ...m, pendingConfirm: false } : m
      ),
    })),

  resetChat: () => set({ ...initialState }),
}));

export function selectPendingConfirm(messages: ChatMessage[]) {
  return messages.find((m) => m.pendingConfirm && m.status === "ready");
}

export function makeDownloadCards(
  urls: string[],
  status: ChatDownloadCardStatus = "queued",
  titles?: Array<string | undefined>
): ChatDownloadCard[] {
  return urls.map((sourceUrl, i) => ({
    id: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    sourceUrl,
    title: titles?.[i],
    status,
  }));
}

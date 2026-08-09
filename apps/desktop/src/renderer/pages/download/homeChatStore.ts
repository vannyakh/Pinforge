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

export type ChatDownloadResult = {
  outPath: string;
  originalPath?: string;
  title?: string;
  sourceUrl: string;
  provider?: string;
  kind?: string;
  packId?: string;
};

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
  result?: ChatDownloadResult | null;
  /** Batch download result cards. */
  results?: ChatDownloadResult[];
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

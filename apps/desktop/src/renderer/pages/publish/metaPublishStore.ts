import { create } from "zustand";
import type { MetaCarouselSlide, MetaPostType } from "@common/publish/types";

export type CarouselSlideDraft = MetaCarouselSlide & {
  id: string;
  /** Renderer-only thumbnail for Page videos / local files. */
  previewUrl?: string;
};

export type MetaPublishOpenOptions = {
  postType?: MetaPostType;
  message?: string;
  filePath?: string;
  filePaths?: string[];
  carouselSlides?: MetaCarouselSlide[];
  link?: string;
  videoIds?: string[];
  sourceLabel?: string;
};

function newSlideId(): string {
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftFromSlide(slide: MetaCarouselSlide, previewUrl?: string): CarouselSlideDraft {
  return { ...slide, id: newSlideId(), previewUrl };
}

function legacyDraftsFromOpen(opts?: MetaPublishOpenOptions): CarouselSlideDraft[] {
  if (opts?.carouselSlides?.length) {
    return opts.carouselSlides.map((s) => draftFromSlide(s));
  }
  const drafts: CarouselSlideDraft[] = [];
  for (const id of opts?.videoIds ?? []) {
    if (id.trim()) drafts.push(draftFromSlide({ kind: "video", pageVideoId: id.trim() }));
  }
  for (const path of opts?.filePaths ?? []) {
    if (!path.trim()) continue;
    const lower = path.toLowerCase();
    const isVideo = /\.(mp4|mov|mkv|webm|m4v)$/.test(lower);
    drafts.push(
      draftFromSlide(
        { kind: isVideo ? "video" : "photo", filePath: path.trim() },
        pathToPreview(path.trim())
      )
    );
  }
  return drafts;
}

function pathToPreview(filePath: string): string {
  return `pinmedia://${encodeURIComponent(filePath.replace(/\\/g, "/"))}`;
}

type MetaPublishUiState = {
  modalOpen: boolean;
  postType: MetaPostType;
  message: string;
  filePath: string;
  link: string;
  carouselSlides: CarouselSlideDraft[];
  selectedSlideId: string | null;
  sourceLabel?: string;
  openPublish: (opts?: MetaPublishOpenOptions) => void;
  closePublish: () => void;
  setPostType: (postType: MetaPostType) => void;
  setMessage: (message: string) => void;
  setFilePath: (filePath: string) => void;
  setLink: (link: string) => void;
  setSelectedSlideId: (id: string | null) => void;
  addCarouselSlide: (slide: MetaCarouselSlide, previewUrl?: string) => void;
  updateCarouselSlide: (id: string, patch: Partial<CarouselSlideDraft>) => void;
  removeCarouselSlide: (id: string) => void;
  moveCarouselSlide: (id: string, direction: -1 | 1) => void;
};

export const META_POST_TYPE_LABELS: Record<MetaPostType, string> = {
  text: "Text post",
  photo: "Photo post",
  video: "Video post",
  video_carousel: "PE · Media carousel",
};

export const DEFAULT_PE_CARD_FOOTER = "Like Page";

export const useMetaPublishStore = create<MetaPublishUiState>((set, get) => ({
  modalOpen: false,
  postType: "photo",
  message: "",
  filePath: "",
  link: "",
  carouselSlides: [],
  selectedSlideId: null,
  sourceLabel: undefined,
  openPublish: (opts) => {
    const slides = legacyDraftsFromOpen(opts);
    set({
      modalOpen: true,
      postType: opts?.postType ?? "photo",
      message: opts?.message ?? "",
      filePath: opts?.filePath ?? "",
      link: opts?.link ?? "",
      carouselSlides: slides,
      selectedSlideId: slides[0]?.id ?? null,
      sourceLabel: opts?.sourceLabel,
    });
  },
  closePublish: () =>
    set({
      modalOpen: false,
      sourceLabel: undefined,
      carouselSlides: [],
      selectedSlideId: null,
    }),
  setPostType: (postType) => set({ postType }),
  setMessage: (message) => set({ message }),
  setFilePath: (filePath) => set({ filePath }),
  setLink: (link) => set({ link }),
  setSelectedSlideId: (id) => set({ selectedSlideId: id }),
  addCarouselSlide: (slide, previewUrl) => {
    const draft = draftFromSlide(slide, previewUrl);
    set((state) => ({
      carouselSlides: [...state.carouselSlides, draft],
      selectedSlideId: draft.id,
    }));
  },
  updateCarouselSlide: (id, patch) => {
    set((state) => ({
      carouselSlides: state.carouselSlides.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  },
  removeCarouselSlide: (id) => {
    const { carouselSlides, selectedSlideId } = get();
    const next = carouselSlides.filter((s) => s.id !== id);
    set({
      carouselSlides: next,
      selectedSlideId:
        selectedSlideId === id ? (next[0]?.id ?? null) : selectedSlideId,
    });
  },
  moveCarouselSlide: (id, direction) => {
    const slides = [...get().carouselSlides];
    const index = slides.findIndex((s) => s.id === id);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    const [item] = slides.splice(index, 1);
    slides.splice(target, 0, item!);
    set({ carouselSlides: slides });
  },
}));

export function carouselSlidesForPublish(slides: CarouselSlideDraft[]): MetaCarouselSlide[] {
  return slides.map(({ id: _id, previewUrl: _preview, ...slide }) => slide);
}

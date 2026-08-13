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
  /** Hide post-type picker in modal (type chosen on Publish page). */
  hidePostTypePicker?: boolean;
  /** Open modal on page-picker step (content already composed). */
  pagePicker?: boolean;
};

export type MetaPublishModalMode = "compose" | "pages";

/** PE carousel UI uses exactly two fixed slots: video (left) + photo (right). */
export const FIXED_CAROUSEL_SLOTS = 2;

export function createDefaultCarouselSlides(): CarouselSlideDraft[] {
  return [
    draftFromSlide({ kind: "video", description: DEFAULT_PE_CARD_FOOTER }),
    draftFromSlide({ kind: "photo", description: DEFAULT_PE_CARD_FOOTER }),
  ];
}

/** Map imported or legacy slides into the fixed video-then-photo layout. */
export function normalizeCarouselSlides(slides: CarouselSlideDraft[]): CarouselSlideDraft[] {
  const defaults = createDefaultCarouselSlides();
  if (!slides.length) return defaults;

  const photo =
    slides.find((s) => s.kind === "photo") ??
    slides.find((s) => s.filePath && !/\.(mp4|mov|mkv|webm|m4v)$/i.test(s.filePath));
  const video =
    slides.find((s) => s.kind === "video") ??
    slides.find((s) => s.pageVideoId || (s.filePath && /\.(mp4|mov|mkv|webm|m4v)$/i.test(s.filePath)));

  return [
    video
      ? { ...defaults[0]!, ...video, kind: "video", id: defaults[0]!.id }
      : defaults[0]!,
    photo
      ? { ...defaults[1]!, ...photo, kind: "photo", id: defaults[1]!.id }
      : defaults[1]!,
  ];
}

export function isPublishDraftReady(state: {
  postType: MetaPostType;
  message: string;
  filePath: string;
  carouselSlides: CarouselSlideDraft[];
}): boolean {
  const { postType, message, filePath, carouselSlides } = state;
  if (postType === "video_carousel") {
    if (carouselSlides.length !== FIXED_CAROUSEL_SLOTS) return false;
    return carouselSlides.every((slide) => {
      if (slide.kind === "video") return Boolean(slide.pageVideoId?.trim() || slide.filePath?.trim());
      return Boolean(slide.filePath?.trim());
    });
  }
  if (postType === "text") return Boolean(message.trim());
  if (postType === "photo" || postType === "video") return Boolean(filePath.trim());
  return false;
}

function newSlideId(): string {
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftFromSlide(slide: MetaCarouselSlide, previewUrl?: string): CarouselSlideDraft {
  return { ...slide, id: newSlideId(), previewUrl };
}

function legacyDraftsFromOpen(opts?: MetaPublishOpenOptions): CarouselSlideDraft[] {
  const postType = opts?.postType ?? "photo";
  if (postType !== "video_carousel") return [];

  let drafts: CarouselSlideDraft[] = [];
  if (opts?.carouselSlides?.length) {
    drafts = opts.carouselSlides.map((s) => draftFromSlide(s));
  } else {
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
          isVideo ? undefined : pathToPreview(path.trim())
        )
      );
    }
  }
  return normalizeCarouselSlides(drafts);
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
  hidePostTypePicker: boolean;
  modalMode: MetaPublishModalMode;
  initDraft: (opts?: MetaPublishOpenOptions) => void;
  openPublish: (opts?: MetaPublishOpenOptions) => void;
  openPagePicker: () => void;
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

export const CAROUSEL_BUTTON_ACTIONS = [
  { label: "Like Page", value: "like_page", text: "Like Page 👉👉👉" },
  { label: "Learn More", value: "learn_more", text: "Learn More" },
  { label: "Shop Now", value: "shop_now", text: "Shop Now" },
  { label: "Sign Up", value: "sign_up", text: "Sign Up" },
  { label: "Watch More", value: "watch_more", text: "Watch More" },
] as const;

export const useMetaPublishStore = create<MetaPublishUiState>((set, get) => ({
  modalOpen: false,
  postType: "photo",
  message: "",
  filePath: "",
  link: "",
  carouselSlides: [],
  selectedSlideId: null,
  sourceLabel: undefined,
  hidePostTypePicker: false,
  modalMode: "compose",
  initDraft: (opts) => {
    const slides = legacyDraftsFromOpen(opts);
    set({
      postType: opts?.postType ?? "photo",
      message: opts?.message ?? "",
      filePath: opts?.filePath ?? "",
      link: opts?.link ?? "",
      carouselSlides: slides,
      selectedSlideId: slides[0]?.id ?? null,
      sourceLabel: opts?.sourceLabel,
      hidePostTypePicker: opts?.hidePostTypePicker ?? false,
      modalOpen: false,
      modalMode: "compose",
    });
  },
  openPublish: (opts) => {
    const slides = legacyDraftsFromOpen(opts);
    set({
      modalOpen: true,
      modalMode: opts?.pagePicker ? "pages" : "compose",
      postType: opts?.postType ?? "photo",
      message: opts?.message ?? "",
      filePath: opts?.filePath ?? "",
      link: opts?.link ?? "",
      carouselSlides: slides,
      selectedSlideId: slides[0]?.id ?? null,
      sourceLabel: opts?.sourceLabel,
      hidePostTypePicker: opts?.hidePostTypePicker ?? false,
    });
  },
  openPagePicker: () =>
    set({
      modalOpen: true,
      modalMode: "pages",
      hidePostTypePicker: true,
    }),
  closePublish: () =>
    set({
      modalOpen: false,
      sourceLabel: undefined,
      carouselSlides: [],
      selectedSlideId: null,
      hidePostTypePicker: false,
      modalMode: "compose",
    }),
  setPostType: (postType) =>
    set((state) => ({
      postType,
      carouselSlides:
        postType === "video_carousel"
          ? normalizeCarouselSlides(state.carouselSlides)
          : state.carouselSlides,
      selectedSlideId:
        postType === "video_carousel"
          ? normalizeCarouselSlides(state.carouselSlides)[0]?.id ?? null
          : state.selectedSlideId,
    })),
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

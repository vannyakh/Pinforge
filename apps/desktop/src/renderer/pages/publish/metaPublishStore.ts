import { create } from "zustand";
import type {
  MetaCarouselSlide,
  MetaPhotoAlbumDestination,
  MetaPhotoPostMode,
  MetaPostType,
} from "@common/publish/types";
import { pathToPreview } from "@renderer/components/publish/carouselPreview";
import {
  carouselLandingLinkIssue,
  carouselCaptionLinkIssue,
} from "@common/publish/carouselLinks";
import {
  peCarouselMediaSetupReady,
  videoCardNeedsThumbnail,
} from "@renderer/components/publish/carouselMediaTypes";
import { api, type MetaPageSummary, type MetaPublishPublic } from "@renderer/api";

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

/** Photo carousel ads: 2–5 image cards with link destinations. */
export const MIN_PHOTO_CAROUSEL = 2;
export const MAX_PHOTO_CAROUSEL = 5;
export const MIN_PHOTO_ALBUM = 2;
export const MAX_PHOTO_ALBUM = 10;

export function createDefaultPhotoCarouselSlides(): CarouselSlideDraft[] {
  return [
    draftFromSlide({ kind: "photo" }),
    draftFromSlide({ kind: "photo" }),
  ];
}

export const META_PHOTO_POST_MODE_LABELS: Record<MetaPhotoPostMode, string> = {
  single: "Single photo",
  album: "Photo album",
  carousel: "Photo carousel (ads)",
};

export function isPublishDraftReady(state: {
  postType: MetaPostType;
  message: string;
  hashtags: string;
  filePath: string;
  link: string;
  photoPostMode: MetaPhotoPostMode;
  photoAlbumPaths: string[];
  photoAlbumDestination: MetaPhotoAlbumDestination;
  photoAlbumFacebookId: string;
  photoAlbumNewName: string;
  photoCarouselSlides: CarouselSlideDraft[];
  carouselSlides: CarouselSlideDraft[];
  /** When true, video card thumbnail generation is in progress (PE carousel compose). */
  carouselGeneratingThumbIds?: Record<string, boolean>;
  /** When true, local video is uploading as unpublished Page video (PE carousel compose). */
  carouselCreatingAdIds?: Record<string, boolean>;
  pageVideos?: Array<{ id: string; thumbnailUrl?: string }>;
}): boolean {
  const {
    postType,
    message,
    hashtags,
    filePath,
    link,
    photoPostMode,
    photoAlbumPaths,
    photoAlbumDestination,
    photoAlbumFacebookId,
    photoAlbumNewName,
    photoCarouselSlides,
    carouselSlides,
    carouselGeneratingThumbIds = {},
    carouselCreatingAdIds = {},
    pageVideos = [],
  } = state;
  const landingLinkIssue = carouselLandingLinkIssue(link);
  const carouselCaptionReady = !carouselCaptionLinkIssue(message, hashtags);
  if (postType === "video_carousel") {
    if (
      !peCarouselMediaSetupReady(
        carouselSlides,
        pageVideos,
        carouselGeneratingThumbIds,
        carouselCreatingAdIds
      )
    ) {
      return false;
    }
    if (landingLinkIssue) return false;
    if (!carouselCaptionReady) return false;
    return true;
  }
  if (postType === "text") return Boolean(message.trim());
  if (postType === "photo") {
    if (photoPostMode === "album") {
      if (photoAlbumPaths.length < MIN_PHOTO_ALBUM) return false;
      if (photoAlbumDestination === "facebook_album") {
        return Boolean(photoAlbumFacebookId.trim() || photoAlbumNewName.trim());
      }
      return true;
    }
    if (photoPostMode === "carousel") {
      if (landingLinkIssue) return false;
      if (!carouselCaptionReady) return false;
      if (photoCarouselSlides.length < MIN_PHOTO_CAROUSEL) return false;
      return photoCarouselSlides.every((slide) => Boolean(slide.filePath?.trim()));
    }
    return Boolean(filePath.trim());
  }
  if (postType === "video") return Boolean(filePath.trim());
  return false;
}

/** First blocking issue for the publish draft, for UI hints when Continue is disabled. */
export function publishDraftBlocker(state: {
  postType: MetaPostType;
  message: string;
  hashtags: string;
  filePath: string;
  link: string;
  photoPostMode: MetaPhotoPostMode;
  photoAlbumPaths: string[];
  photoAlbumDestination: MetaPhotoAlbumDestination;
  photoAlbumFacebookId: string;
  photoAlbumNewName: string;
  photoCarouselSlides: CarouselSlideDraft[];
  carouselSlides: CarouselSlideDraft[];
  carouselGeneratingThumbIds?: Record<string, boolean>;
  carouselCreatingAdIds?: Record<string, boolean>;
  pageVideos?: Array<{ id: string; thumbnailUrl?: string }>;
}): string | null {
  const {
    postType,
    message,
    hashtags,
    filePath,
    link,
    photoPostMode,
    photoAlbumPaths,
    photoAlbumDestination,
    photoAlbumFacebookId,
    photoAlbumNewName,
    photoCarouselSlides,
    carouselSlides,
    carouselGeneratingThumbIds = {},
    carouselCreatingAdIds = {},
    pageVideos = [],
  } = state;

  if (postType === "video_carousel") {
    const video = carouselSlides.find((s) => s.kind === "video");
    if (carouselCreatingAdIds[video?.id ?? ""]) {
      return "Uploading video to Facebook Page…";
    }
    if (carouselGeneratingThumbIds[video?.id ?? ""]) {
      return "Generating video thumbnails (ffmpeg)…";
    }
    if (
      !peCarouselMediaSetupReady(
        carouselSlides,
        pageVideos,
        carouselGeneratingThumbIds,
        carouselCreatingAdIds
      )
    ) {
      if (!video?.pageVideoId?.trim() && !video?.filePath?.trim()) {
        return "Add a video source on the left card first.";
      }
      if (video?.filePath?.trim() && !video.pageVideoId?.trim()) {
        return "Wait for the Page video upload to finish.";
      }
      if (video && videoCardNeedsThumbnail(video, pageVideos)) {
        return "Pick a video thumbnail or wait for ffmpeg generation to finish.";
      }
      const photo = carouselSlides.find((s) => s.kind === "photo");
      if (!photo?.filePath?.trim()) {
        return "Add a photo for the right carousel card.";
      }
      return "Finish media setup on the Post cards before continuing.";
    }
    const linkIssue = carouselLandingLinkIssue(link);
    if (linkIssue) return linkIssue;
    const captionIssue = carouselCaptionLinkIssue(message, hashtags);
    if (captionIssue) return captionIssue;
    return null;
  }

  if (postType === "text" && !message.trim()) return "Enter a caption for the text post.";
  if (postType === "photo") {
    if (photoPostMode === "album") {
      if (photoAlbumPaths.length < MIN_PHOTO_ALBUM) {
        return `Add at least ${MIN_PHOTO_ALBUM} photos for an album post.`;
      }
      if (
        photoAlbumDestination === "facebook_album" &&
        !photoAlbumFacebookId.trim() &&
        !photoAlbumNewName.trim()
      ) {
        return "Select a Facebook Album or enter a name for a new one.";
      }
      return null;
    }
    if (photoPostMode === "carousel") {
      const linkIssue = carouselLandingLinkIssue(link);
      if (linkIssue) return linkIssue;
      const captionIssue = carouselCaptionLinkIssue(message, hashtags);
      if (captionIssue) return captionIssue;
      if (photoCarouselSlides.length < MIN_PHOTO_CAROUSEL) {
        return `Add at least ${MIN_PHOTO_CAROUSEL} photos for the carousel.`;
      }
      if (!photoCarouselSlides.every((slide) => Boolean(slide.filePath?.trim()))) {
        return "Each carousel card needs an image.";
      }
      return null;
    }
    if (!filePath.trim()) return "Choose a photo file.";
    return null;
  }
  if (postType === "video" && !filePath.trim()) return "Choose a video file.";
  return null;
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

type MetaPublishUiState = {
  modalOpen: boolean;
  postType: MetaPostType;
  message: string;
  hashtags: string;
  filePath: string;
  videoThumbnailPath: string;
  photoPostMode: MetaPhotoPostMode;
  photoAlbumPaths: string[];
  photoAlbumDestination: MetaPhotoAlbumDestination;
  photoAlbumFacebookId: string;
  photoAlbumNewName: string;
  photoCarouselSlides: CarouselSlideDraft[];
  link: string;
  carouselCtaOption: CarouselCtaOption;
  carouselSlides: CarouselSlideDraft[];
  selectedSlideId: string | null;
  sourceLabel?: string;
  hidePostTypePicker: boolean;
  modalMode: MetaPublishModalMode;
  config: MetaPublishPublic | null;
  loadingConfig: boolean;
  pages: MetaPageSummary[];
  loadingPages: boolean;
  selectedPageIds: string[];
  carouselCreatingAdIds: Record<string, boolean>;
  carouselGeneratingThumbIds: Record<string, boolean>;
  initDraft: (opts?: MetaPublishOpenOptions) => void;
  openPublish: (opts?: MetaPublishOpenOptions) => void;
  openPagePicker: () => void;
  preparePagePicker: () => void;
  closePublish: () => void;
  refreshConfig: () => Promise<void>;
  loadPages: () => Promise<void>;
  togglePage: (pageId: string, checked: boolean) => void;
  setSelectedPageIds: (pageIds: string[]) => void;
  selectAllPages: (checked: boolean) => void;
  setPostType: (postType: MetaPostType) => void;
  setMessage: (message: string) => void;
  setHashtags: (hashtags: string) => void;
  setFilePath: (filePath: string) => void;
  setVideoThumbnailPath: (path: string | undefined) => void;
  setPhotoPostMode: (mode: MetaPhotoPostMode) => void;
  setPhotoAlbumDestination: (destination: MetaPhotoAlbumDestination) => void;
  setPhotoAlbumFacebookId: (albumId: string) => void;
  setPhotoAlbumNewName: (name: string) => void;
  setPhotoAlbumPaths: (paths: string[]) => void;
  addPhotoAlbumPaths: (paths: string[]) => void;
  removePhotoAlbumPath: (path: string) => void;
  setPhotoCarouselSlides: (slides: CarouselSlideDraft[]) => void;
  addPhotoCarouselSlide: () => void;
  updatePhotoCarouselSlide: (id: string, patch: Partial<CarouselSlideDraft>) => void;
  removePhotoCarouselSlide: (id: string) => void;
  setLink: (link: string) => void;
  setCarouselCtaOption: (option: CarouselCtaOption) => void;
  setSelectedSlideId: (id: string | null) => void;
  addCarouselSlide: (slide: MetaCarouselSlide, previewUrl?: string) => void;
  updateCarouselSlide: (id: string, patch: Partial<CarouselSlideDraft>) => void;
  removeCarouselSlide: (id: string) => void;
  moveCarouselSlide: (id: string, direction: -1 | 1) => void;
  setCarouselCreatingAdIds: (ids: Record<string, boolean>) => void;
  setCarouselGeneratingThumbIds: (ids: Record<string, boolean>) => void;
};

export const META_POST_TYPE_LABELS: Record<MetaPostType, string> = {
  text: "Text post",
  photo: "Photo post",
  video: "Video post",
  video_carousel: "PE · Media carousel",
};

export const DEFAULT_PE_CARD_FOOTER = "Like Page";

export const CAROUSEL_BUTTON_ACTIONS = [
  { label: "Like Page", value: "like_page", text: "Like Page 👉👉👉", ctaType: "LIKE_PAGE" },
  { label: "Learn More", value: "learn_more", text: "Learn More", ctaType: "LEARN_MORE" },
  { label: "Shop Now", value: "shop_now", text: "Shop Now", ctaType: "SHOP_NOW" },
  { label: "Sign Up", value: "sign_up", text: "Sign Up", ctaType: "SIGN_UP" },
  { label: "Watch More", value: "watch_more", text: "Watch More", ctaType: "WATCH_MORE" },
] as const;

export type CarouselCtaOption = (typeof CAROUSEL_BUTTON_ACTIONS)[number]["value"];

export function carouselCtaTypeForOption(option: string): string | undefined {
  return CAROUSEL_BUTTON_ACTIONS.find((a) => a.value === option)?.ctaType;
}

function runPagePickerSetup(get: () => MetaPublishUiState): void {
  void (async () => {
    await get().refreshConfig();
    const pageId = get().config?.pageId;
    get().setSelectedPageIds(pageId ? [pageId] : []);
    try {
      await get().loadPages();
    } catch {
      /* modal shows empty state + refresh */
    }
  })();
}

export const useMetaPublishStore = create<MetaPublishUiState>((set, get) => ({
  modalOpen: false,
  postType: "photo",
  message: "",
  hashtags: "",
  filePath: "",
  videoThumbnailPath: "",
  photoPostMode: "single",
  photoAlbumPaths: [],
  photoAlbumDestination: "feed",
  photoAlbumFacebookId: "",
  photoAlbumNewName: "",
  photoCarouselSlides: createDefaultPhotoCarouselSlides(),
  link: "",
  carouselCtaOption: "like_page",
  carouselSlides: [],
  selectedSlideId: null,
  sourceLabel: undefined,
  hidePostTypePicker: false,
  modalMode: "compose",
  config: null,
  loadingConfig: false,
  pages: [],
  loadingPages: false,
  selectedPageIds: [],
  carouselCreatingAdIds: {},
  carouselGeneratingThumbIds: {},
  refreshConfig: async () => {
    if (get().loadingConfig) return;
    set({ loadingConfig: true });
    try {
      set({ config: await api.getMetaPublish() });
    } catch {
      set({ config: null });
    } finally {
      set({ loadingConfig: false });
    }
  },
  loadPages: async () => {
    if (get().loadingPages) return;
    set({ loadingPages: true });
    try {
      set({ pages: await api.listMetaPages() });
    } catch {
      set({ pages: [] });
      throw new Error("Could not load Facebook Pages.");
    } finally {
      set({ loadingPages: false });
    }
  },
  togglePage: (pageId, checked) => {
    set((state) => ({
      selectedPageIds: checked
        ? state.selectedPageIds.includes(pageId)
          ? state.selectedPageIds
          : [...state.selectedPageIds, pageId]
        : state.selectedPageIds.filter((id) => id !== pageId),
    }));
  },
  setSelectedPageIds: (pageIds) => set({ selectedPageIds: pageIds }),
  selectAllPages: (checked) => {
    const pages = get().pages;
    set({ selectedPageIds: checked ? pages.map((page) => page.id) : [] });
  },
  initDraft: (opts) => {
    const slides = legacyDraftsFromOpen(opts);
    set({
      postType: opts?.postType ?? "photo",
      message: opts?.message ?? "",
      hashtags: "",
      filePath: opts?.filePath ?? "",
      videoThumbnailPath: "",
      photoPostMode: "single",
      photoAlbumPaths: opts?.filePaths?.filter(Boolean) ?? [],
      photoAlbumDestination: "feed",
      photoAlbumFacebookId: "",
      photoAlbumNewName: "",
      photoCarouselSlides: createDefaultPhotoCarouselSlides(),
      carouselCtaOption: "like_page",
      link: opts?.link ?? "",
      carouselSlides: slides,
      selectedSlideId: slides[0]?.id ?? null,
      sourceLabel: opts?.sourceLabel,
      hidePostTypePicker: opts?.hidePostTypePicker ?? false,
      modalOpen: false,
      modalMode: "compose",
      carouselCreatingAdIds: {},
      carouselGeneratingThumbIds: {},
    });
  },
  openPublish: (opts) => {
    const slides = legacyDraftsFromOpen(opts);
    set({
      modalOpen: true,
      modalMode: opts?.pagePicker ? "pages" : "compose",
      postType: opts?.postType ?? "photo",
      message: opts?.message ?? "",
      hashtags: "",
      filePath: opts?.filePath ?? "",
      videoThumbnailPath: "",
      photoPostMode: "single",
      photoAlbumPaths: opts?.filePaths?.filter(Boolean) ?? [],
      photoAlbumDestination: "feed",
      photoAlbumFacebookId: "",
      photoAlbumNewName: "",
      photoCarouselSlides: createDefaultPhotoCarouselSlides(),
      carouselCtaOption: "like_page",
      link: opts?.link ?? "",
      carouselSlides: slides,
      selectedSlideId: slides[0]?.id ?? null,
      sourceLabel: opts?.sourceLabel,
      hidePostTypePicker: opts?.hidePostTypePicker ?? false,
      carouselCreatingAdIds: {},
      carouselGeneratingThumbIds: {},
    });
    void get().refreshConfig();
    if (opts?.pagePicker) {
      runPagePickerSetup(get);
    }
  },
  openPagePicker: () => {
    set({
      modalOpen: true,
      modalMode: "pages",
      hidePostTypePicker: true,
    });
    runPagePickerSetup(get);
  },
  preparePagePicker: () => {
    runPagePickerSetup(get);
  },
  closePublish: () =>
    set({
      modalOpen: false,
      sourceLabel: undefined,
      hashtags: "",
      videoThumbnailPath: "",
      photoPostMode: "single",
      photoAlbumPaths: [],
      photoAlbumDestination: "feed",
      photoAlbumFacebookId: "",
      photoAlbumNewName: "",
      photoCarouselSlides: createDefaultPhotoCarouselSlides(),
      carouselCtaOption: "like_page",
      carouselSlides: [],
      selectedSlideId: null,
      hidePostTypePicker: false,
      modalMode: "compose",
      selectedPageIds: [],
      pages: [],
    }),
  setPostType: (postType) =>
    set((state) => ({
      postType,
      carouselSlides:
        postType === "video_carousel"
          ? normalizeCarouselSlides(state.carouselSlides)
          : state.carouselSlides,
      photoCarouselSlides:
        postType === "photo" && state.photoCarouselSlides.length === 0
          ? createDefaultPhotoCarouselSlides()
          : state.photoCarouselSlides,
      selectedSlideId:
        postType === "video_carousel"
          ? normalizeCarouselSlides(state.carouselSlides)[0]?.id ?? null
          : state.selectedSlideId,
    })),
  setMessage: (message) => set({ message }),
  setHashtags: (hashtags) => set({ hashtags }),
  setFilePath: (filePath) => set({ filePath, videoThumbnailPath: "" }),
  setVideoThumbnailPath: (path) => set({ videoThumbnailPath: path?.trim() ?? "" }),
  setPhotoPostMode: (photoPostMode) => set({ photoPostMode }),
  setPhotoAlbumDestination: (photoAlbumDestination) =>
    set({
      photoAlbumDestination,
      ...(photoAlbumDestination === "feed"
        ? { photoAlbumFacebookId: "", photoAlbumNewName: "" }
        : {}),
    }),
  setPhotoAlbumFacebookId: (photoAlbumFacebookId) =>
    set({
      photoAlbumFacebookId,
      ...(photoAlbumFacebookId.trim() ? { photoAlbumNewName: "" } : {}),
    }),
  setPhotoAlbumNewName: (photoAlbumNewName) =>
    set({
      photoAlbumNewName,
      ...(photoAlbumNewName.trim() ? { photoAlbumFacebookId: "" } : {}),
    }),
  setPhotoAlbumPaths: (photoAlbumPaths) => set({ photoAlbumPaths }),
  addPhotoAlbumPaths: (paths) =>
    set((state) => {
      const seen = new Set(state.photoAlbumPaths);
      const next = [...state.photoAlbumPaths];
      for (const path of paths) {
        const trimmed = path.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        if (!/\.(jpe?g|png|gif|bmp|tiff?)$/i.test(trimmed)) continue;
        seen.add(trimmed);
        next.push(trimmed);
      }
      return { photoAlbumPaths: next.slice(0, MAX_PHOTO_ALBUM) };
    }),
  removePhotoAlbumPath: (path) =>
    set((state) => ({
      photoAlbumPaths: state.photoAlbumPaths.filter((p) => p !== path),
    })),
  setPhotoCarouselSlides: (photoCarouselSlides) => set({ photoCarouselSlides }),
  addPhotoCarouselSlide: () => {
    const { photoCarouselSlides } = get();
    if (photoCarouselSlides.length >= MAX_PHOTO_CAROUSEL) return;
    const draft = draftFromSlide({ kind: "photo" });
    set({
      photoCarouselSlides: [...photoCarouselSlides, draft],
      selectedSlideId: draft.id,
    });
  },
  updatePhotoCarouselSlide: (id, patch) => {
    set((state) => ({
      photoCarouselSlides: state.photoCarouselSlides.map((s) =>
        s.id === id ? { ...s, ...patch } : s
      ),
    }));
  },
  removePhotoCarouselSlide: (id) => {
    const { photoCarouselSlides, selectedSlideId } = get();
    if (photoCarouselSlides.length <= MIN_PHOTO_CAROUSEL) return;
    const next = photoCarouselSlides.filter((s) => s.id !== id);
    set({
      photoCarouselSlides: next,
      selectedSlideId: selectedSlideId === id ? (next[0]?.id ?? null) : selectedSlideId,
    });
  },
  setLink: (link) => set({ link }),
  setCarouselCtaOption: (carouselCtaOption) =>
    set((state) => {
      const preset = CAROUSEL_BUTTON_ACTIONS.find((a) => a.value === carouselCtaOption);
      const nextText = preset?.text ?? DEFAULT_PE_CARD_FOOTER;
      return {
        carouselCtaOption,
        carouselSlides: state.carouselSlides.map((slide) => ({
          ...slide,
          description: nextText,
          callToActionType: preset?.ctaType,
        })),
      };
    }),
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
  setCarouselCreatingAdIds: (ids) => set({ carouselCreatingAdIds: ids }),
  setCarouselGeneratingThumbIds: (ids) => set({ carouselGeneratingThumbIds: ids }),
}));

export function carouselSlidesForPublish(slides: CarouselSlideDraft[]): MetaCarouselSlide[] {
  return slides.map(({ id: _id, previewUrl: _preview, ...slide }) => slide);
}

export function peCarouselSlidesForPublish(
  slides: CarouselSlideDraft[],
  ctaOption: CarouselCtaOption
): MetaCarouselSlide[] {
  const ctaType = carouselCtaTypeForOption(ctaOption);
  return carouselSlidesForPublish(slides).map(({ link: _link, ...slide }) => ({
    ...slide,
    callToActionType: slide.callToActionType ?? ctaType,
  }));
}

export function photoCarouselSlidesForPublish(
  slides: CarouselSlideDraft[],
  ctaOption: CarouselCtaOption
): MetaCarouselSlide[] {
  const ctaType = carouselCtaTypeForOption(ctaOption);
  return carouselSlidesForPublish(slides).map(({ link: _link, ...slide }) => ({
    ...slide,
    callToActionType: slide.callToActionType ?? ctaType,
  }));
}

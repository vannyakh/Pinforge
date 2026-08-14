import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Input, Message, Spin, Tabs } from "@arco-design/web-react";
import { FolderOpen, Like, LinkCloud, Pic, PlayOne, Plus, UploadOne, VideoOne } from "@icon-park/react";
import AionModal from "@renderer/components/base/AionModal";
import {
  pathToPreview,
  previewUrlForLocalPath,
  slidePreviewUrl,
} from "@renderer/components/publish/carouselPreview";
import {
  validateCarouselImagePick,
  validateCarouselVideoPick,
} from "@renderer/components/publish/carouselMediaTypes";
import {
  buildProcessMediaRequest,
  extractTitleFromProcess,
  isFacebookUrl,
  pickImageFromProcessResults,
  pickVideoFromProcessResults,
} from "@renderer/components/publish/carouselSourceMedia";
import {
  CAROUSEL_BUTTON_ACTIONS,
  DEFAULT_PE_CARD_FOOTER,
  useMetaPublishStore,
  type CarouselSlideDraft,
} from "@renderer/pages/publish/metaPublishStore";
import { useApp } from "@renderer/hooks/context/AppContext";
import { api, type MetaPageVideoSummary } from "@renderer/api";

type SourceDraft = {
  pageVideoId?: string;
  filePath?: string;
  previewUrl?: string;
  name?: string;
};

type VideoSourceTab = "url" | "file";

type CarouselSourceModalProps = {
  visible: boolean;
  slide: CarouselSlideDraft | null;
  pageVideos: MetaPageVideoSummary[];
  loadingPageVideos?: boolean;
  onClose: () => void;
  onApply: (patch: Partial<CarouselSlideDraft>) => void;
  /** Carousel card picker vs single photo/video post source. */
  variant?: "carousel" | "post";
};

function draftFromSlide(slide: CarouselSlideDraft | null): SourceDraft {
  if (!slide) return {};
  return {
    pageVideoId: slide.pageVideoId,
    filePath: slide.filePath,
    previewUrl: slide.previewUrl,
    name: slide.name,
  };
}

function draftHasSource(draft: SourceDraft, kind: CarouselSlideDraft["kind"]): boolean {
  if (kind === "video") return Boolean(draft.pageVideoId?.trim() || draft.filePath?.trim());
  return Boolean(draft.filePath?.trim());
}

function draftPreviewUrl(
  draft: SourceDraft,
  kind: CarouselSlideDraft["kind"],
  pageVideos: MetaPageVideoSummary[]
): string | undefined {
  const thumb = slidePreviewUrl(
    {
      id: "draft",
      kind,
      pageVideoId: draft.pageVideoId,
      filePath: draft.filePath,
      previewUrl: draft.previewUrl,
    },
    pageVideos
  );
  if (thumb) return thumb;
  if (kind === "video" && draft.filePath?.trim()) {
    return pathToPreview(draft.filePath.trim());
  }
  return undefined;
}

type LocalMediaTileProps = {
  filePath: string;
  name: string;
  active: boolean;
  isVideo: boolean;
  onSelect: () => void;
};

const LocalMediaTile: React.FC<LocalMediaTileProps> = ({
  filePath,
  name,
  active,
  isVideo,
  onSelect,
}) => {
  const [failed, setFailed] = useState(false);
  const src = pathToPreview(filePath);

  useEffect(() => {
    setFailed(false);
  }, [filePath]);

  return (
    <button
      type="button"
      className={`carousel-source-modal__video-item ${active ? "is-active" : ""}`}
      onClick={onSelect}
      title={name}
    >
      <div className="carousel-source-modal__video-item__media">
        {!failed ? (
          isVideo ? (
            <video
              src={src}
              className="carousel-source-modal__video-item__img"
              muted
              playsInline
              preload="metadata"
              onError={() => setFailed(true)}
            />
          ) : (
            <img
              src={src}
              alt=""
              className="carousel-source-modal__video-item__img"
              onError={() => setFailed(true)}
            />
          )
        ) : isVideo ? (
          <VideoOne theme="outline" size="20" fill="currentColor" />
        ) : (
          <Pic theme="outline" size="20" fill="currentColor" />
        )}
        {isVideo ? (
          <span className="carousel-source-modal__video-item__play" aria-hidden>
            <PlayOne theme="filled" size="16" fill="currentColor" />
          </span>
        ) : null}
      </div>
      <span className="carousel-source-modal__video-item__title truncate">{name}</span>
    </button>
  );
};

type CardPreviewMediaProps = {
  src?: string;
  isVideo: boolean;
  showPlay: boolean;
  className: string;
  fallback: React.ReactNode;
};

const CardPreviewMedia: React.FC<CardPreviewMediaProps> = ({
  src,
  isVideo,
  showPlay,
  className,
  fallback,
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return <>{fallback}</>;

  if (isVideo) {
    return (
      <>
        <video
          src={src}
          className={className}
          muted
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        />
        {showPlay ? (
          <span className="carousel-source-modal__preview-play" aria-hidden>
            <PlayOne theme="filled" size="28" fill="currentColor" />
          </span>
        ) : null}
      </>
    );
  }

  return <img src={src} alt="" className={className} onError={() => setFailed(true)} />;
};

const TabEmpty: React.FC<{ description: string }> = ({ description }) => (
  <div className="carousel-source-modal__tab-empty">
    <Empty description={description} />
  </div>
);

const CarouselSourceModal: React.FC<CarouselSourceModalProps> = ({
  visible,
  slide,
  pageVideos,
  loadingPageVideos = false,
  onClose,
  onApply,
  variant = "carousel",
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { settings, refresh } = useApp();
  const message = useMetaPublishStore((s) => s.message);
  const setMessage = useMetaPublishStore((s) => s.setMessage);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [loadingLocalFolder, setLoadingLocalFolder] = useState(false);
  const [localFolder, setLocalFolder] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<
    Array<{ filePath: string; name: string; mtimeMs: number }>
  >([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [draft, setDraft] = useState<SourceDraft>({});
  const [videoTab, setVideoTab] = useState<VideoSourceTab>("url");
  const isVideo = slide?.kind === "video";
  const isPost = variant === "post";
  const mediaKind = isVideo ? "video" : "photo";

  const loadLocalFolder = useCallback(
    async (folder: string) => {
      const trimmed = folder.trim();
      if (!trimmed) {
        setLocalFiles([]);
        return;
      }
      setLoadingLocalFolder(true);
      try {
        const files = await api.listLocalMediaInFolder(trimmed, mediaKind);
        setLocalFiles(files);
      } catch (err) {
        setLocalFiles([]);
        Message.error(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingLocalFolder(false);
      }
    },
    [mediaKind]
  );

  useEffect(() => {
    if (!visible) return;
    setDraft(draftFromSlide(slide));
    setSourceUrl("");
    setVideoTab("url");
    const defaultFolder = settings?.outDir?.trim() || null;
    setLocalFolder(defaultFolder);
    if (defaultFolder) void loadLocalFolder(defaultFolder);
    else setLocalFiles([]);
    void refresh();
  }, [visible, slide, refresh, settings?.outDir, loadLocalFolder]);

  const preview = useMemo(
    () => (slide ? draftPreviewUrl(draft, slide.kind, pageVideos) : undefined),
    [draft, slide, pageVideos]
  );

  const canApply = slide ? draftHasSource(draft, slide.kind) : false;
  const carouselSlides = useMetaPublishStore((s) => s.carouselSlides);
  const ctaText = carouselSlides[0]?.description?.trim() || DEFAULT_PE_CARD_FOOTER;
  const ctaPreset =
    CAROUSEL_BUTTON_ACTIONS.find((a) => a.text === ctaText) ?? CAROUSEL_BUTTON_ACTIONS[0];
  const ctaButtonLabel = ctaPreset?.label ?? DEFAULT_PE_CARD_FOOTER;
  const ctaOption = ctaPreset?.value ?? "like_page";
  const fileLabel = draft.filePath?.split(/[/\\]/).pop() ?? draft.name;

  const handleClose = useCallback(() => {
    if (fetchingUrl || loadingLocalFolder || loadingPageVideos) return;
    onClose();
  }, [onClose, fetchingUrl, loadingLocalFolder, loadingPageVideos]);

  const selectLocalFile = (filePath: string, name?: string) => {
    if (!slide) return;
    setDraft({
      pageVideoId: undefined,
      filePath,
      previewUrl: previewUrlForLocalPath(filePath, slide.kind),
      name: name ?? filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, ""),
    });
  };

  const pickLocalFolder = async () => {
    if (loadingLocalFolder) return;
    const folder = await api.pickFolderPath(localFolder ?? settings?.outDir);
    if (!folder) return;
    setLocalFolder(folder);
    if (isVideo) setVideoTab("file");
    await loadLocalFolder(folder);
  };

  const pickFileFromComputer = async () => {
    if (fetchingUrl || loadingLocalFolder) return;
    if (isVideo) {
      const paths = await api.pickMediaFiles();
      const path = paths[0];
      if (!path) return;
      const err = validateCarouselVideoPick(path);
      if (err) {
        Message.warning(err);
        return;
      }
      selectLocalFile(path);
      setVideoTab("file");
      return;
    }

    const paths = await api.pickImageFiles();
    const path = paths[0];
    if (!path) return;
    const err = validateCarouselImagePick(path);
    if (err) {
      Message.warning(err);
      return;
    }
    selectLocalFile(path);
  };

  const fetchFromUrl = async () => {
    if (!slide || fetchingUrl) return;
    const url = sourceUrl.trim();
    if (!url) {
      Message.info("Paste a video URL first.");
      return;
    }
    if (!settings?.outDir?.trim()) {
      Message.warning("Set a download folder in Settings before fetching media.");
      return;
    }

    setFetchingUrl(true);
    try {
      const res = await api.processMedia(buildProcessMediaRequest(url, settings));
      await refresh();

      if (!res.results.length) {
        const err = res.errors[0]?.error;
        Message.error(err ?? (isVideo ? "No video found for this URL." : "No image found for this URL."));
        return;
      }

      const picked = isVideo
        ? pickVideoFromProcessResults(res.results)
        : pickImageFromProcessResults(res.results);
      if (!picked) {
        Message.warning(isVideo ? "No video found for this URL." : "No image found for this URL.");
        return;
      }

      selectLocalFile(
        picked.filePath,
        picked.title ?? picked.filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "")
      );
      if (isVideo) setVideoTab("url");

      const title = extractTitleFromProcess(res, picked);
      if (title && isFacebookUrl(url)) {
        if (!message.trim()) setMessage(title);
        const stored = await api.getCaptionTitleSuggestions();
        if (!stored.includes(title)) {
          await api.setCaptionTitleSuggestions([...stored, title]);
        }
      }

      Message.success("Media ready — review the preview and apply.");
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingUrl(false);
    }
  };

  const handleApply = () => {
    if (!slide || !canApply) return;
    onApply({
      pageVideoId: draft.pageVideoId,
      filePath: draft.filePath,
      previewUrl: draft.previewUrl,
      name: draft.name,
    });
    onClose();
  };

  const renderLocalFileGrid = () => {
    if (loadingLocalFolder) {
      return (
        <div className="carousel-source-modal__tab-empty">
          <Spin />
        </div>
      );
    }

    if (localFiles.length === 0) {
      return (
        <TabEmpty
          description={
            localFolder
              ? isVideo
                ? "No video files in this folder."
                : "No image files in this folder."
              : "Browse to a folder to list local media."
          }
        />
      );
    }

    return (
      <div className="carousel-source-modal__video-grid">
        {localFiles.map((item) => (
          <LocalMediaTile
            key={item.filePath}
            filePath={item.filePath}
            name={item.name}
            active={draft.filePath === item.filePath}
            isVideo={isVideo}
            onSelect={() =>
              selectLocalFile(item.filePath, item.name.replace(/\.[^.]+$/, ""))
            }
          />
        ))}
      </div>
    );
  };

  const renderLocalBrowse = () => (
    <div className="carousel-source-modal__tab-panel">
      <div className="carousel-source-modal__folder-row">
        <button
          type="button"
          className="carousel-source-modal__browse-btn"
          disabled={loadingLocalFolder}
          onClick={() => void pickFileFromComputer()}
        >
          <UploadOne theme="outline" size="16" fill="currentColor" />
          <span>{isVideo ? "Upload video" : "Upload image"}</span>
        </button>
        <button
          type="button"
          className="carousel-source-modal__browse-btn"
          disabled={loadingLocalFolder}
          onClick={() => void pickLocalFolder()}
        >
          {loadingLocalFolder ? (
            <Spin size={16} />
          ) : (
            <FolderOpen theme="outline" size="16" fill="currentColor" />
          )}
          <span>Browse folder</span>
        </button>
      </div>
      <div
        className="carousel-source-modal__folder-path truncate mb-8px"
        title={localFolder ?? undefined}
      >
        {localFolder ?? "Optional — pick a folder to list media files"}
      </div>
      <div className="carousel-source-modal__sources-head">
        <span>File sources</span>
        {localFiles.length > 0 ? (
          <span className="carousel-source-modal__sources-count">{localFiles.length}</span>
        ) : null}
      </div>

      {renderLocalFileGrid()}

      {fileLabel && draft.filePath ? (
        <div className="carousel-source-modal__file text-12px text-t-secondary truncate">
          Selected · {fileLabel}
        </div>
      ) : null}
    </div>
  );

  const renderUrlTab = () => (
    <div className="carousel-source-modal__tab-panel">
      <div className="carousel-source-modal__url-form">
        <Input
          value={sourceUrl}
          onChange={setSourceUrl}
          placeholder="Paste video URL (Facebook, YouTube, TikTok, …)"
          allowClear
          prefix={<LinkCloud theme="outline" size="16" fill="currentColor" />}
          onPressEnter={() => void fetchFromUrl()}
        />
        <Button type="primary" loading={fetchingUrl} onClick={() => void fetchFromUrl()}>
          Get video
        </Button>
      </div>
      {!sourceUrl.trim() && !draft.filePath ? (
        <TabEmpty description="Paste a link to download and use the video source." />
      ) : draft.filePath && videoTab === "url" ? (
        <div className="carousel-source-modal__file text-12px text-t-secondary truncate text-center mt-10px">
          Ready · {fileLabel}
        </div>
      ) : null}
    </div>
  );

  const footer = (
    <div className="flex justify-end gap-10px w-full">
      <Button onClick={handleClose} disabled={fetchingUrl || loadingLocalFolder}>
        Cancel
      </Button>
      <Button
        type="primary"
        disabled={!canApply || fetchingUrl || loadingLocalFolder}
        onClick={handleApply}
      >
        {isVideo ? "Use this video" : "Use this photo"}
      </Button>
    </div>
  );

  return (
    <AionModal
      key={slide?.id ?? "carousel-source"}
      variant="standard"
      visible={visible}
      onCancel={handleClose}
      autoFocus={false}
      focusLock={false}
      unmountOnExit
      maskClosable={!fetchingUrl && !loadingPageVideos}
      escToExit={!fetchingUrl && !loadingPageVideos}
      header={{
        title: isVideo ? "Select video" : "Select photo",
        subtitle: isVideo
          ? "Paste a URL or pick a file from a folder."
          : isPost
            ? "Browse a folder and pick an image file."
            : "Browse a folder and pick a file.",
        showClose: true,
      }}
      footer={{ render: () => footer, divider: true }}
      style={{ width: 720 }}
    >
      <div ref={bodyRef} className="carousel-source-modal">
        <section className="carousel-source-modal__source">
          {loadingPageVideos ? (
            <div className="carousel-source-modal__tab-empty">
              <Spin />
            </div>
          ) : isVideo ? (
            <Tabs activeTab={videoTab} onChange={(v) => setVideoTab(v as VideoSourceTab)} type="line">
              <Tabs.TabPane key="url" title="URL">
                {renderUrlTab()}
              </Tabs.TabPane>
              <Tabs.TabPane key="file" title="File">
                {renderLocalBrowse()}
              </Tabs.TabPane>
            </Tabs>
          ) : (
            renderLocalBrowse()
          )}
        </section>

        <aside className="carousel-source-modal__preview">
          <div className="carousel-source-modal__preview-label">
            {isPost ? "Media preview" : "Card preview"}
          </div>
          <div
            className={
              isPost
                ? "carousel-source-modal__preview-card carousel-source-modal__preview-card--post"
                : "carousel-source-modal__preview-card"
            }
          >
            <div className="carousel-source-modal__preview-media">
              <CardPreviewMedia
                src={preview}
                isVideo={isVideo}
                showPlay={canApply}
                className="carousel-source-modal__preview-img"
                fallback={
                  isVideo ? (
                    <VideoOne theme="outline" size="36" fill="currentColor" className="text-t-tertiary" />
                  ) : (
                    <Pic theme="outline" size="36" fill="currentColor" className="text-t-tertiary" />
                  )
                }
              />
            </div>
            {!isPost ? (
              <div className="fb-pe-card__footer">
                <div className="fb-pe-card__cta truncate">{ctaText}</div>
                <span className="fb-pe-card__cta-btn" aria-hidden>
                  {ctaOption === "like_page" ? (
                    <Like theme="outline" size="14" fill="currentColor" />
                  ) : (
                    <Plus theme="outline" size="14" fill="currentColor" />
                  )}
                  {ctaButtonLabel}
                </span>
              </div>
            ) : null}
          </div>
          <p className="carousel-source-modal__preview-hint text-12px text-t-tertiary m-0">
            {isPost
              ? "This is how your media will look in the post."
              : "This is how the carousel card will appear on your Page feed."}
          </p>
        </aside>
      </div>
    </AionModal>
  );
};

export default CarouselSourceModal;

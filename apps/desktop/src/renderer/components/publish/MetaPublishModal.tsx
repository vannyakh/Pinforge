import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Message, Select } from "@arco-design/web-react";
import { useNavigate } from "react-router-dom";
import AionModal from "@renderer/components/base/AionModal";
import PeCarouselBuilder from "@renderer/components/publish/PeCarouselBuilder";
import { api, type MetaPageVideoSummary, type MetaPostType, type MetaPublishPublic } from "@renderer/api";
import facebookLogo from "@renderer/assets/provider-logos/facebook.svg";
import {
  META_POST_TYPE_LABELS,
  carouselSlidesForPublish,
  useMetaPublishStore,
} from "@renderer/pages/publish/metaPublishStore";

const POST_TYPE_OPTIONS: MetaPostType[] = ["text", "photo", "video", "video_carousel"];
const MIN_CAROUSEL = 2;
const MAX_CAROUSEL = 5;

const MetaPublishModal: React.FC = () => {
  const navigate = useNavigate();
  const modalOpen = useMetaPublishStore((s) => s.modalOpen);
  const postType = useMetaPublishStore((s) => s.postType);
  const message = useMetaPublishStore((s) => s.message);
  const filePath = useMetaPublishStore((s) => s.filePath);
  const carouselSlides = useMetaPublishStore((s) => s.carouselSlides);
  const link = useMetaPublishStore((s) => s.link);
  const sourceLabel = useMetaPublishStore((s) => s.sourceLabel);
  const closePublish = useMetaPublishStore((s) => s.closePublish);
  const setPostType = useMetaPublishStore((s) => s.setPostType);
  const setMessage = useMetaPublishStore((s) => s.setMessage);
  const setFilePath = useMetaPublishStore((s) => s.setFilePath);
  const setLink = useMetaPublishStore((s) => s.setLink);

  const [config, setConfig] = useState<MetaPublishPublic | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pageVideos, setPageVideos] = useState<MetaPageVideoSummary[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const refreshConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      setConfig(await api.getMetaPublish());
    } catch {
      setConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const loadPageVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      setPageVideos(await api.listMetaPageVideos(30));
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingVideos(false);
    }
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    void refreshConfig();
  }, [modalOpen, refreshConfig]);

  useEffect(() => {
    if (!modalOpen || postType !== "video_carousel" || !config?.hasPageToken) return;
    void loadPageVideos();
  }, [modalOpen, postType, config?.hasPageToken, loadPageVideos]);

  useEffect(() => {
    if (postType !== "video_carousel" || !config?.pageId || link.trim()) return;
    setLink(`https://www.facebook.com/${config.pageId}`);
  }, [postType, config?.pageId, link, setLink]);

  const isCarousel = postType === "video_carousel";
  const needsFile = postType === "photo" || postType === "video";

  const carouselReady = useMemo(() => {
    if (carouselSlides.length < MIN_CAROUSEL || carouselSlides.length > MAX_CAROUSEL) return false;
    return carouselSlides.every((slide) => {
      if (slide.kind === "video") return Boolean(slide.pageVideoId?.trim() || slide.filePath?.trim());
      return Boolean(slide.filePath?.trim());
    });
  }, [carouselSlides]);

  const readyToPublish = useMemo(() => {
    if (!config?.hasPageToken) return false;
    if (isCarousel) return carouselReady;
    if (postType === "text") return Boolean(message.trim());
    return Boolean(filePath.trim());
  }, [config?.hasPageToken, isCarousel, carouselReady, postType, message, filePath]);

  const pickMedia = async () => {
    const path = await api.pickMediaFile();
    if (path) setFilePath(path);
  };

  const publish = async () => {
    if (!config?.hasPageToken) {
      Message.warning("Select a Facebook Page in Settings → Publishing first.");
      return;
    }
    if (postType === "text" && !message.trim()) {
      Message.warning("Enter a message for the text post.");
      return;
    }
    if (needsFile && !filePath.trim()) {
      Message.warning(postType === "photo" ? "Choose a photo file." : "Choose a video file.");
      return;
    }
    if (isCarousel && !carouselReady) {
      Message.warning(`Add ${MIN_CAROUSEL}–${MAX_CAROUSEL} complete carousel cards.`);
      return;
    }

    setPublishing(true);
    try {
      const result = await api.postToMetaPage({
        message,
        filePath: needsFile ? filePath.trim() : undefined,
        postType,
        link: isCarousel ? link.trim() : undefined,
        carouselSlides: isCarousel ? carouselSlidesForPublish(carouselSlides) : undefined,
      });
      if (!result.ok) {
        Message.error(result.message);
        return;
      }
      Message.success(
        result.postId ? `${result.message} (ID: ${result.postId})` : result.message
      );
      closePublish();
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  const openSettings = () => {
    closePublish();
    void navigate("/settings/publishing");
  };

  return (
    <AionModal
      variant="standard"
      visible={modalOpen}
      header={{
        title: (
          <span className="inline-flex items-center gap-8px">
            <img src={facebookLogo} alt="" className="remote-channel-logo" draggable={false} />
            Publish to Facebook Page
          </span>
        ),
        showClose: true,
      }}
      onCancel={closePublish}
      autoFocus={false}
      focusLock
      unmountOnExit
      footer={
        <>
          <Button onClick={closePublish}>Cancel</Button>
          <Button
            type="primary"
            loading={publishing}
            disabled={!readyToPublish}
            onClick={() => void publish()}
          >
            Publish
          </Button>
        </>
      }
      style={{ width: isCarousel ? 720 : 520 }}
    >
      {loadingConfig ? (
        <div className="text-13px text-t-secondary py-12px">Loading…</div>
      ) : !config?.connected || !config.hasPageToken ? (
        <div className="flex flex-col gap-12px py-4px">
          <p className="text-13px text-t-secondary m-0">
            Connect your Meta Developer App and select a Facebook Page in Publishing settings
            before posting.
          </p>
          <Button type="primary" onClick={openSettings}>
            Open Publishing settings
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-14px">
          <div className="text-12px text-t-tertiary">
            Posting as <span className="text-t-primary font-500">{config.pageName ?? "Page"}</span>
            {sourceLabel ? (
              <>
                {" "}
                · from <span className="text-t-secondary">{sourceLabel}</span>
              </>
            ) : null}
          </div>

          <div className="flex flex-col gap-6px">
            <div className="text-13px text-t-primary">Post type</div>
            <Select
              value={postType}
              onChange={(v) => setPostType(v as MetaPostType)}
              options={POST_TYPE_OPTIONS.map((t) => ({
                label: META_POST_TYPE_LABELS[t],
                value: t,
              }))}
            />
          </div>

          <div className="flex flex-col gap-6px">
            <div className="text-13px text-t-primary">
              {isCarousel ? "Post caption" : postType === "text" ? "Message" : "Caption"}
            </div>
            <Input.TextArea
              value={message}
              onChange={setMessage}
              placeholder={
                isCarousel
                  ? "Main text above the carousel (hashtags, links, emojis)…"
                  : postType === "text"
                    ? "Write your Page post…"
                    : "Optional caption for your media…"
              }
              autoSize={{ minRows: 3, maxRows: 8 }}
            />
          </div>

          {isCarousel ? (
            <PeCarouselBuilder
              pageId={config.pageId}
              pageVideos={pageVideos}
              loadingVideos={loadingVideos}
              onRefreshVideos={() => void loadPageVideos()}
            />
          ) : null}

          {needsFile ? (
            <div className="flex flex-col gap-6px">
              <div className="text-13px text-t-primary">
                {postType === "photo" ? "Photo file" : "Video file"}
              </div>
              <div className="flex gap-8px">
                <Input
                  value={filePath}
                  onChange={setFilePath}
                  placeholder={postType === "photo" ? "Path to image" : "Path to video"}
                  className="flex-1"
                />
                <Button onClick={() => void pickMedia()}>Browse</Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </AionModal>
  );
};

export default MetaPublishModal;

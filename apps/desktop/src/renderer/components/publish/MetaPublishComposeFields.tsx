import React, { useCallback, useEffect, useState } from "react";
import { Button, Input, Message, Select } from "@arco-design/web-react";
import PeCarouselBuilder from "@renderer/components/publish/PeCarouselBuilder";
import { api, type MetaPageVideoSummary, type MetaPostType, type MetaPublishPublic } from "@renderer/api";
import {
  META_POST_TYPE_LABELS,
  useMetaPublishStore,
} from "@renderer/pages/publish/metaPublishStore";

const POST_TYPE_OPTIONS: MetaPostType[] = ["text", "photo", "video", "video_carousel"];

type MetaPublishComposeFieldsProps = {
  showPostTypePicker?: boolean;
  pageId?: string;
  onConfigLoaded?: (config: MetaPublishPublic | null) => void;
};

const MetaPublishComposeFields: React.FC<MetaPublishComposeFieldsProps> = ({
  showPostTypePicker = false,
  pageId,
  onConfigLoaded,
}) => {
  const postType = useMetaPublishStore((s) => s.postType);
  const message = useMetaPublishStore((s) => s.message);
  const filePath = useMetaPublishStore((s) => s.filePath);
  const setPostType = useMetaPublishStore((s) => s.setPostType);
  const setMessage = useMetaPublishStore((s) => s.setMessage);
  const setFilePath = useMetaPublishStore((s) => s.setFilePath);
  const link = useMetaPublishStore((s) => s.link);
  const setLink = useMetaPublishStore((s) => s.setLink);

  const [config, setConfig] = useState<MetaPublishPublic | null>(null);
  const [pageVideos, setPageVideos] = useState<MetaPageVideoSummary[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  useEffect(() => {
    let alive = true;
    void api
      .getMetaPublish()
      .then((next) => {
        if (!alive) return;
        setConfig(next);
        onConfigLoaded?.(next);
      })
      .catch(() => {
        if (!alive) return;
        setConfig(null);
        onConfigLoaded?.(null);
      });
    return () => {
      alive = false;
    };
  }, [onConfigLoaded]);

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

  const isCarousel = postType === "video_carousel";
  const needsFile = postType === "photo" || postType === "video";
  const carouselPageId = pageId ?? config?.pageId;

  useEffect(() => {
    if (!isCarousel || !config?.connected) return;
    void loadPageVideos();
  }, [isCarousel, config?.connected, loadPageVideos]);

  useEffect(() => {
    if (!isCarousel || !carouselPageId || link.trim()) return;
    setLink(`https://www.facebook.com/${carouselPageId}`);
  }, [isCarousel, carouselPageId, link, setLink]);

  const pickMedia = async () => {
    const path = await api.pickMediaFile();
    if (path) setFilePath(path);
  };

  return (
    <div className="flex flex-col gap-14px">
      {showPostTypePicker ? (
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
      ) : (
        <div className="text-12px text-t-tertiary">
          Post type · <span className="text-t-primary font-500">{META_POST_TYPE_LABELS[postType]}</span>
        </div>
      )}

      {isCarousel ? (
        <PeCarouselBuilder
          pageId={carouselPageId}
          pageVideos={pageVideos}
          loadingVideos={loadingVideos}
          onRefreshVideos={() => void loadPageVideos()}
        />
      ) : (
        <div className="flex flex-col gap-6px">
          <div className="text-13px text-t-primary">
            {postType === "text" ? "Message" : "Caption"}
          </div>
          <Input.TextArea
            value={message}
            onChange={setMessage}
            placeholder={
              postType === "text" ? "Write your Page post…" : "Optional caption for your media…"
            }
            autoSize={{ minRows: 3, maxRows: 8 }}
          />
        </div>
      )}

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
  );
};

export default MetaPublishComposeFields;

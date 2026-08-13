import React, { useEffect, useMemo, useState } from "react";
import { Button, Message } from "@arco-design/web-react";
import { ArrowLeft, LinkCloud, Pic, Right, Share, VideoOne } from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import type { MetaPostType } from "@common/publish/types";
import MetaPublishComposeFields from "@renderer/components/publish/MetaPublishComposeFields";
import {
  META_POST_TYPE_LABELS,
  isPublishDraftReady,
  useMetaPublishStore,
} from "@renderer/pages/publish/metaPublishStore";
import {
  SettingsHeader,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@renderer/pages/settings/components/SettingsLayout";
import type { MetaPublishPublic } from "@renderer/api";
import { api } from "@renderer/api";

const PUBLISH_TYPES: MetaPostType[] = ["text", "photo", "video", "video_carousel"];

const POST_TYPE_HINTS: Record<MetaPostType, string> = {
  text: "Share a text update on your Facebook Page feed.",
  photo: "Upload a photo and publish it to your Page.",
  video: "Upload a video and publish it to your Page.",
  video_carousel: "Build a PE-style media carousel with mixed photo and video cards.",
};

type PublishStep = "type" | "compose";

function postTypeIcon(type: MetaPostType): React.ReactNode {
  const size = 18;
  if (type === "text") return <LinkCloud theme="outline" size={size} fill="currentColor" />;
  if (type === "photo") return <Pic theme="outline" size={size} fill="currentColor" />;
  if (type === "video") return <VideoOne theme="outline" size={size} fill="currentColor" />;
  return <Share theme="outline" size={size} fill="currentColor" />;
}

const PublishSteps: React.FC<{ step: PublishStep }> = ({ step }) => (
  <div className="publish-steps" aria-label="Publish progress">
    <span className={step === "type" ? "publish-steps__item is-active" : "publish-steps__item is-done"}>
      1 · Post type
    </span>
    <span className="publish-steps__sep" aria-hidden />
    <span className={step === "compose" ? "publish-steps__item is-active" : "publish-steps__item"}>
      2 · Compose
    </span>
    <span className="publish-steps__sep" aria-hidden />
    <span className="publish-steps__item">3 · Select Pages</span>
  </div>
);

const PublishPage: React.FC = () => {
  const navigate = useNavigate();
  const initDraft = useMetaPublishStore((s) => s.initDraft);
  const openPagePicker = useMetaPublishStore((s) => s.openPagePicker);
  const postType = useMetaPublishStore((s) => s.postType);
  const message = useMetaPublishStore((s) => s.message);
  const filePath = useMetaPublishStore((s) => s.filePath);
  const carouselSlides = useMetaPublishStore((s) => s.carouselSlides);
  const setLink = useMetaPublishStore((s) => s.setLink);
  const link = useMetaPublishStore((s) => s.link);

  const [step, setStep] = useState<PublishStep>("type");
  const [config, setConfig] = useState<MetaPublishPublic | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  useEffect(() => {
    if (step !== "compose") return;
    setConfigLoading(true);
    void api
      .getMetaPublish()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setConfigLoading(false));
  }, [step]);

  const contentReady = useMemo(
    () => isPublishDraftReady({ postType, message, filePath, carouselSlides }),
    [postType, message, filePath, carouselSlides]
  );

  const onTypeSelect = (type: MetaPostType) => {
    initDraft({ postType: type, hidePostTypePicker: true });
    setStep("compose");
  };

  const goBackToType = () => {
    setStep("type");
  };

  const continueToPages = () => {
    if (!contentReady) {
      Message.warning("Complete the post content before continuing.");
      return;
    }
    if (!config?.connected) {
      Message.warning("Connect Facebook in Publishing settings first.");
      void navigate("/settings/publishing");
      return;
    }
    if (postType === "video_carousel" && config.pageId && !link.trim()) {
      setLink(`https://www.facebook.com/${config.pageId}`);
    }
    openPagePicker();
  };

  const openSettings = () => {
    void navigate("/settings/publishing");
  };

  return (
    <div className="publish-page flex flex-col flex-1 min-h-0 h-full w-full overflow-y-auto">
      <SettingsPage width="wide">
        <PublishSteps step={step} />

        {step === "type" ? (
          <>
            <SettingsHeader
              title="Publish"
              description="Step 1 — choose a post type for your Facebook Page."
            />
            <SettingsSection title="Post type">
              {PUBLISH_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="settings-row publish-type-row"
                  onClick={() => onTypeSelect(type)}
                >
                  <div className="settings-row__meta">
                    <div className="settings-row__title inline-flex items-center gap-8px">
                      <span className="publish-type-row__icon" aria-hidden>
                        {postTypeIcon(type)}
                      </span>
                      {META_POST_TYPE_LABELS[type]}
                    </div>
                    <div className="settings-row__desc">{POST_TYPE_HINTS[type]}</div>
                  </div>
                  <div className="settings-row__control">
                    <Right
                      theme="outline"
                      size="16"
                      fill="currentColor"
                      className="publish-type-row__chevron"
                    />
                  </div>
                </button>
              ))}
            </SettingsSection>
          </>
        ) : (
          <>
            <SettingsHeader
              title={postType === "video_carousel" ? "Post Builder" : "Compose post"}
              description={
                postType === "video_carousel"
                  ? "Review the imported media, write your caption, pick CTA details, choose thumbnails, then continue to page selection."
                  : "Step 2 — add your caption and media, then choose Pages to publish to."
              }
            />

            <SettingsSection title={postType === "video_carousel" ? "Carousel post" : "Post content"}>
              {configLoading ? (
                <div className="settings-field py-14px text-13px text-t-secondary">Loading…</div>
              ) : !config?.connected ? (
                <SettingsRow
                  title="Facebook not connected"
                  description="Connect your Meta Developer App and Facebook account before publishing."
                >
                  <Button type="primary" size="small" onClick={openSettings}>
                    Publishing settings
                  </Button>
                </SettingsRow>
              ) : (
                <div className="settings-field py-14px">
                  <MetaPublishComposeFields pageId={config.pageId} />
                </div>
              )}
            </SettingsSection>

            <div className="publish-page__actions flex items-center justify-between gap-12px pt-4px">
              <Button type="outline" icon={<ArrowLeft theme="outline" size="16" />} onClick={goBackToType}>
                Back
              </Button>
              <Button type="primary" disabled={!contentReady || !config?.connected} onClick={continueToPages}>
                {postType === "video_carousel" ? "Next step · Select Pages" : "Continue · Select Pages"}
              </Button>
            </div>
          </>
        )}
      </SettingsPage>
    </div>
  );
};

export default PublishPage;

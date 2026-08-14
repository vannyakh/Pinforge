import React, { useEffect, useMemo, useState } from "react";
import { Button, Message } from "@arco-design/web-react";
import { ArrowLeft, Copy, LinkCloud, Pic, Right, Share, VideoOne } from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import type { MetaPostType } from "@common/publish/types";
import { api, type MetaPageVideoSummary } from "@renderer/api";
import ClonePagePostPanel from "@renderer/components/publish/ClonePagePostPanel";
import MetaPublishComposeFields from "@renderer/components/publish/MetaPublishComposeFields";
import MetaPublishPagePicker from "@renderer/components/publish/MetaPublishPagePicker";
import {
  META_POST_TYPE_LABELS,
  isPublishDraftReady,
  publishDraftBlocker,
  useMetaPublishStore,
} from "@renderer/pages/publish/metaPublishStore";
import {
  SettingsHeader,
  SettingsPage,
  SettingsScrollShell,
  SettingsSection,
} from "@renderer/pages/settings/components/SettingsLayout";

const PUBLISH_TYPES: MetaPostType[] = ["video_carousel", "photo", "video"];

const POST_TYPE_HINTS: Record<MetaPostType, string> = {
  text: "Share a text update on your Facebook Page feed.",
  photo: "Single photo, multi-photo album, or link carousel ad post.",
  video: "Upload a video and publish it to your Page.",
  video_carousel: "Build a PE-style media carousel with mixed photo and video cards.",
};

type PublishStep = "type" | "clone" | "compose" | "pages";

function postTypeIcon(type: MetaPostType): React.ReactNode {
  const size = 18;
  if (type === "text") return <LinkCloud theme="outline" size={size} fill="currentColor" />;
  if (type === "photo") return <Pic theme="outline" size={size} fill="currentColor" />;
  if (type === "video") return <VideoOne theme="outline" size={size} fill="currentColor" />;
  return <Share theme="outline" size={size} fill="currentColor" />;
}

type PublishTypeOptionProps = {
  type: MetaPostType;
  onSelect: (type: MetaPostType) => void;
};

const PublishTypeOption: React.FC<PublishTypeOptionProps> = ({ type, onSelect }) => (
  <button type="button" className="publish-type-option" onClick={() => onSelect(type)}>
    <span className="publish-type-option__icon" aria-hidden>
      {postTypeIcon(type)}
    </span>
    <span className="publish-type-option__content">
      <span className="publish-type-option__title">{META_POST_TYPE_LABELS[type]}</span>
      <span className="publish-type-option__desc">{POST_TYPE_HINTS[type]}</span>
    </span>
    <Right
      theme="outline"
      size="16"
      fill="currentColor"
      className="publish-type-option__chevron"
      aria-hidden
    />
  </button>
);

const CloneTypeOption: React.FC<{ onSelect: () => void }> = ({ onSelect }) => (
  <button type="button" className="publish-type-option" onClick={onSelect}>
    <span className="publish-type-option__icon" aria-hidden>
      <Copy theme="outline" size={18} fill="currentColor" />
    </span>
    <span className="publish-type-option__content">
      <span className="publish-type-option__title">Clone Page post</span>
      <span className="publish-type-option__desc">
        Paste a Facebook Page URL, pick a post, and reuse its caption and layout.
      </span>
    </span>
    <Right
      theme="outline"
      size="16"
      fill="currentColor"
      className="publish-type-option__chevron"
      aria-hidden
    />
  </button>
);

const PublishSteps: React.FC<{ step: PublishStep; viaClone: boolean; postType?: MetaPostType }> = ({
  step,
  viaClone,
  postType,
}) => {
  const step1Class =
    step === "type" ? "publish-steps__item is-active" : "publish-steps__item is-done";
  const step2Label =
    viaClone && step === "clone"
      ? "Clone source"
      : postType === "video_carousel"
        ? "Build post"
        : "Compose";
  const step2Class =
    step === "clone"
      ? "publish-steps__item is-active"
      : step === "compose" || step === "pages"
        ? "publish-steps__item is-done"
        : "publish-steps__item";
  const step3Class = step === "pages" ? "publish-steps__item is-active" : "publish-steps__item";

  return (
    <div className="publish-steps" aria-label="Publish progress">
      <span className={step1Class}>1 · Post type</span>
      <span className="publish-steps__sep" aria-hidden />
      <span className={step2Class}>2 · {step2Label}</span>
      <span className="publish-steps__sep" aria-hidden />
      <span className={step3Class}>3 · Select Pages</span>
    </div>
  );
};

const PublishPage: React.FC = () => {
  const navigate = useNavigate();
  const initDraft = useMetaPublishStore((s) => s.initDraft);
  const preparePagePicker = useMetaPublishStore((s) => s.preparePagePicker);
  const closePublish = useMetaPublishStore((s) => s.closePublish);
  const postType = useMetaPublishStore((s) => s.postType);
  const message = useMetaPublishStore((s) => s.message);
  const hashtags = useMetaPublishStore((s) => s.hashtags);
  const filePath = useMetaPublishStore((s) => s.filePath);
  const photoPostMode = useMetaPublishStore((s) => s.photoPostMode);
  const photoAlbumPaths = useMetaPublishStore((s) => s.photoAlbumPaths);
  const photoAlbumDestination = useMetaPublishStore((s) => s.photoAlbumDestination);
  const photoAlbumFacebookId = useMetaPublishStore((s) => s.photoAlbumFacebookId);
  const photoAlbumNewName = useMetaPublishStore((s) => s.photoAlbumNewName);
  const photoCarouselSlides = useMetaPublishStore((s) => s.photoCarouselSlides);
  const carouselSlides = useMetaPublishStore((s) => s.carouselSlides);
  const carouselCreatingAdIds = useMetaPublishStore((s) => s.carouselCreatingAdIds);
  const carouselGeneratingThumbIds = useMetaPublishStore((s) => s.carouselGeneratingThumbIds);
  const link = useMetaPublishStore((s) => s.link);
  const config = useMetaPublishStore((s) => s.config);
  const loadingConfig = useMetaPublishStore((s) => s.loadingConfig);
  const refreshConfig = useMetaPublishStore((s) => s.refreshConfig);

  const [step, setStep] = useState<PublishStep>("type");
  const [viaClone, setViaClone] = useState(false);
  const [pageVideos, setPageVideos] = useState<MetaPageVideoSummary[]>([]);

  useEffect(() => {
    if (step === "type") return;
    void refreshConfig();
  }, [step, refreshConfig]);

  useEffect(() => {
    if (step !== "compose" || postType !== "video_carousel" || !config?.connected) return;
    let alive = true;
    void api.listMetaPageVideos(30).then((videos) => {
      if (alive) setPageVideos(videos);
    });
    return () => {
      alive = false;
    };
  }, [step, postType, config?.connected]);

  const contentReady = useMemo(
    () =>
      isPublishDraftReady({
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
        pageVideos: postType === "video_carousel" ? pageVideos : undefined,
        carouselCreatingAdIds:
          postType === "video_carousel" ? carouselCreatingAdIds : undefined,
        carouselGeneratingThumbIds:
          postType === "video_carousel" ? carouselGeneratingThumbIds : undefined,
      }),
    [
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
      pageVideos,
      carouselCreatingAdIds,
      carouselGeneratingThumbIds,
    ]
  );

  const draftBlocker = useMemo(
    () =>
      publishDraftBlocker({
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
        pageVideos: postType === "video_carousel" ? pageVideos : undefined,
        carouselCreatingAdIds:
          postType === "video_carousel" ? carouselCreatingAdIds : undefined,
        carouselGeneratingThumbIds:
          postType === "video_carousel" ? carouselGeneratingThumbIds : undefined,
      }),
    [
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
      pageVideos,
      carouselCreatingAdIds,
      carouselGeneratingThumbIds,
    ]
  );

  const onTypeSelect = (type: MetaPostType) => {
    setViaClone(false);
    initDraft({ postType: type, hidePostTypePicker: true });
    setStep("compose");
  };

  const onCloneSelect = () => {
    setViaClone(true);
    setStep("clone");
  };

  const goBackToType = () => {
    setStep("type");
    setViaClone(false);
  };

  const goBackFromCompose = () => {
    setStep(viaClone ? "clone" : "type");
  };

  const continueToPages = () => {
    if (!contentReady) {
      Message.warning(draftBlocker ?? "Complete the post content before continuing.");
      return;
    }
    if (!config?.connected) {
      Message.warning("Connect Facebook in Publishing settings first.");
      void navigate("/settings/publishing");
      return;
    }
    preparePagePicker();
    setStep("pages");
  };

  const resetPublishFlow = () => {
    closePublish();
    setStep("type");
    setViaClone(false);
  };

  const openSettings = () => {
    void navigate("/settings/publishing");
  };

  return (
    <SettingsScrollShell className="publish-page">
      <SettingsPage width="wide">
        <PublishSteps step={step} viaClone={viaClone} postType={postType} />

        {step === "type" ? (
          <>
            <SettingsHeader
              title="Publish"
              description="Step 1 — choose a post type for your Facebook Page."
            />
            <SettingsSection plain>
              <div className="publish-type-list" role="list">
                {PUBLISH_TYPES.map((type) => (
                  <PublishTypeOption key={type} type={type} onSelect={onTypeSelect} />
                ))}
                <CloneTypeOption onSelect={onCloneSelect} />
              </div>
            </SettingsSection>
          </>
        ) : null}

        {step === "clone" ? (
          <>
            <SettingsHeader
              title="Clone Page post"
              description="Step 2 — enter a Facebook Page URL, load recent posts, then pick one to clone."
            />
            <SettingsSection plain>
              {loadingConfig ? (
                <div className="text-13px text-t-secondary py-8px">Loading…</div>
              ) : (
                <ClonePagePostPanel
                  config={config}
                  onOpenSettings={openSettings}
                  onCloned={() => setStep("compose")}
                />
              )}
            </SettingsSection>
            <div className="publish-page__actions flex items-center justify-between gap-12px pt-4px">
              <Button
                type="outline"
                icon={<ArrowLeft theme="outline" size="16" />}
                onClick={goBackToType}
              >
                Back
              </Button>
            </div>
          </>
        ) : null}

        {step === "compose" ? (
          <>
            <SettingsHeader
              title={postType === "video_carousel" ? "Build post" : "Compose post"}
              description={
                postType === "video_carousel"
                  ? "Step 2 — set up Post cards."
                  : viaClone
                    ? "Step 2 — caption copied from the source post. Add your media, then choose Pages to publish to."
                    : "Step 2 — add your caption and media, then choose Pages to publish to."
              }
            />

            <SettingsSection plain>
              {loadingConfig ? (
                <div className="text-13px text-t-secondary py-8px">Loading…</div>
              ) : !config?.connected ? (
                <div className="flex flex-col gap-12px py-8px">
                  <div>
                    <div className="text-14px text-t-primary">Facebook not connected</div>
                    <div className="text-12px text-t-tertiary mt-4px">
                      Connect your Meta Developer App and Facebook account before publishing.
                    </div>
                  </div>
                  <div>
                    <Button type="primary" size="small" onClick={openSettings}>
                      Publishing settings
                    </Button>
                  </div>
                </div>
              ) : (
                <MetaPublishComposeFields pageId={config.pageId} inlinePreview />
              )}
            </SettingsSection>

            <div className="publish-page__actions flex items-center gap-12px w-full pt-4px">
              <Button
                type="outline"
                icon={<ArrowLeft theme="outline" size="16" />}
                onClick={goBackFromCompose}
              >
                Back
              </Button>
              <div className="flex-1 min-w-0" />
              <Button
                type="primary"
                disabled={!contentReady || !config?.connected}
                title={draftBlocker ?? undefined}
                onClick={continueToPages}
              >
                {postType === "video_carousel"
                  ? "Select Pages to publish"
                  : "Continue · Select Pages"}
              </Button>
            </div>
          </>
        ) : null}

        {step === "pages" ? (
          <>
            <SettingsHeader
              title="Select Pages"
              description="Step 3 — choose Facebook Pages, set schedule if needed, then publish."
            />
            <SettingsSection plain>
              {loadingConfig ? (
                <div className="text-13px text-t-secondary py-8px">Loading…</div>
              ) : !config?.connected ? (
                <div className="flex flex-col gap-12px py-8px">
                  <div className="text-14px text-t-primary">Facebook not connected</div>
                  <Button type="primary" size="small" onClick={openSettings}>
                    Publishing settings
                  </Button>
                </div>
              ) : (
                <MetaPublishPagePicker
                  cancelLabel="Back"
                  onCancel={() => setStep("compose")}
                  onPublished={resetPublishFlow}
                />
              )}
            </SettingsSection>
          </>
        ) : null}
      </SettingsPage>
    </SettingsScrollShell>
  );
};

export default PublishPage;

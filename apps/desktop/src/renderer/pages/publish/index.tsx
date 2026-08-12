import React from "react";
import { Button } from "@arco-design/web-react";
import { LinkCloud, Pic, Right, Share, VideoOne } from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import type { MetaPostType } from "@common/publish/types";
import {
  META_POST_TYPE_LABELS,
  useMetaPublishStore,
} from "@renderer/pages/publish/metaPublishStore";
import facebookLogo from "@renderer/assets/provider-logos/facebook.svg";

const PUBLISH_TYPES: MetaPostType[] = ["text", "photo", "video", "video_carousel"];

const POST_TYPE_HINTS: Record<MetaPostType, string> = {
  text: "Share a text update on your Facebook Page.",
  photo: "Upload a photo and publish it to your Page.",
  video: "Upload a video and publish it to your Page.",
  video_carousel: "Build a PE-style media carousel with mixed photo and video cards.",
};

function postTypeIcon(type: MetaPostType): React.ReactNode {
  const size = 22;
  if (type === "text") return <LinkCloud theme="outline" size={size} />;
  if (type === "photo") return <Pic theme="outline" size={size} />;
  if (type === "video") return <VideoOne theme="outline" size={size} />;
  return <Share theme="outline" size={size} />;
}

const PublishPage: React.FC = () => {
  const navigate = useNavigate();
  const openPublish = useMetaPublishStore((s) => s.openPublish);

  return (
    <div className="publish-page flex flex-col flex-1 min-h-0 h-full w-full">
      <div className="shrink-0 mb-20px flex items-start justify-between gap-16px flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-10px mb-6px">
            <img src={facebookLogo} alt="" className="remote-channel-logo" draggable={false} />
            <h1 className="text-22px font-600 text-t-primary m-0">Publish</h1>
          </div>
          <p className="text-13px text-t-secondary m-0 max-w-640px">
            Choose a post type to open the publish dialog. Connect your Page in Settings if you
            have not already.
          </p>
        </div>
        <Button type="outline" icon={<Right theme="outline" size="14" />} onClick={() => void navigate("/posts")}>
          View Page posts
        </Button>
      </div>

      <div className="publish-type-grid grid gap-12px pb-16px">
        {PUBLISH_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="publish-type-card text-left rd-12px border border-b-base bg-2 p-16px cursor-pointer transition-colors hover:border-primary-6 hover:bg-hover"
            onClick={() => openPublish({ postType: type })}
          >
            <span className="publish-type-card__icon inline-flex items-center justify-center w-44px h-44px rd-10px bg-3 text-primary-6 mb-12px">
              {postTypeIcon(type)}
            </span>
            <span className="block text-15px font-600 text-t-primary mb-4px">
              {META_POST_TYPE_LABELS[type]}
            </span>
            <span className="block text-13px text-t-secondary leading-relaxed">
              {POST_TYPE_HINTS[type]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PublishPage;

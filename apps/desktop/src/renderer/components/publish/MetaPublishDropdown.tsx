import React from "react";
import { Button, Dropdown, Menu, Tooltip } from "@arco-design/web-react";
import { Down, Share } from "@icon-park/react";
import type { MetaPostType } from "@common/publish/types";
import { META_POST_TYPE_LABELS } from "@renderer/pages/publish/metaPublishStore";

type MetaPublishDropdownProps = {
  disabled?: boolean;
  size?: "mini" | "small" | "default";
  type?: "text" | "default" | "primary" | "secondary" | "dashed" | "outline";
  className?: string;
  showLabel?: boolean;
  tooltip?: string;
  onSelect: (postType: MetaPostType) => void;
};

const POST_TYPES: MetaPostType[] = ["text", "photo", "video", "video_carousel"];

const MetaPublishDropdown: React.FC<MetaPublishDropdownProps> = ({
  disabled,
  size = "small",
  type = "outline",
  className,
  showLabel = true,
  tooltip = "Publish to Facebook Page",
  onSelect,
}) => {
  const menu = (
    <Menu onClickMenuItem={(key) => onSelect(key as MetaPostType)}>
      {POST_TYPES.map((postType) => (
        <Menu.Item key={postType}>{META_POST_TYPE_LABELS[postType]}</Menu.Item>
      ))}
    </Menu>
  );

  const button = (
    <Dropdown droplist={menu} trigger="click" position="bl" disabled={disabled}>
      <Button
        className={className}
        size={size}
        type={type}
        disabled={disabled}
        icon={<Share theme="outline" size={14} />}
      >
        {showLabel ? (
          <span className="inline-flex items-center gap-4px">
            <span className="tasks-header-btn__label">Publish</span>
            <Down theme="outline" size="12" fill="currentColor" />
          </span>
        ) : (
          <Down theme="outline" size="12" fill="currentColor" />
        )}
      </Button>
    </Dropdown>
  );

  return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button;
};

export default MetaPublishDropdown;

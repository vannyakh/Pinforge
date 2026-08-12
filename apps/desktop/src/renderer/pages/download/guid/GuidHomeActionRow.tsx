import React from "react";
import { Badge, Button, Dropdown, Menu, Tooltip } from "@arco-design/web-react";
import {
  ArrowUp,
  Clear,
  Down,
  LinkOne,
  List,
  Plus,
  Shield,
  Filter,
  SettingTwo,
  VideoOne,
  Translation,
} from "@icon-park/react";
import type { FormatPreset, SubtitleMode, YoutubeQuality } from "@renderer/api";
import styles from "./guid.module.css";

type GuidHomeActionRowProps = {
  hasUrl: boolean;
  loading: boolean;
  disabled: boolean;
  format: FormatPreset;
  formats?: FormatPreset[];
  enhance: boolean;
  showEnhance?: boolean;
  /** YouTube max-height target shown when URL is YouTube. */
  youtubeQuality?: YoutubeQuality;
  youtubeQualityChoices?: YoutubeQuality[];
  showYoutubeQuality?: boolean;
  onYoutubeQualityChange?: (quality: YoutubeQuality) => void;
  subtitles?: SubtitleMode;
  showSubtitles?: boolean;
  onSubtitlesChange?: (mode: SubtitleMode) => void;
  /** Extra controls on the left (e.g. Get playlist checkbox). */
  leftOptions?: React.ReactNode;
  clipboardMonitor?: boolean;
  queueCount?: number;
  canQueue?: boolean;
  onQueue?: () => void;
  onOpenTasks?: () => void;
  onPasteOrClear: () => void;
  onFormatChange: (format: FormatPreset) => void;
  onEnhanceChange: (enhance: boolean) => void;
  onOpenSettings?: () => void;
  onSend: () => void;
};

const FORMAT_LABELS: Record<FormatPreset, string> = {
  best: "Best",
  mp4: "MP4",
  "audio-only": "Audio",
};

const SUBTITLE_LABELS: Record<SubtitleMode, string> = {
  none: "No subs",
  separate: "Subs",
  embed: "Embed",
};

function youtubeQualityLabel(q: YoutubeQuality): string {
  return q === "best" ? "Best" : `${q}p`;
}

/**
 * Chat composer toolbar: paste · format · YouTube tools · queue · send.
 */
const GuidHomeActionRow: React.FC<GuidHomeActionRowProps> = ({
  hasUrl,
  loading,
  disabled,
  format,
  formats = ["best", "mp4", "audio-only"],
  enhance,
  showEnhance = true,
  youtubeQuality = "best",
  youtubeQualityChoices = ["best", "2160", "1440", "1080", "720", "480", "360"],
  showYoutubeQuality = false,
  onYoutubeQualityChange,
  subtitles = "separate",
  showSubtitles = false,
  onSubtitlesChange,
  leftOptions,
  clipboardMonitor = false,
  queueCount = 0,
  canQueue = false,
  onQueue,
  onOpenTasks,
  onPasteOrClear,
  onFormatChange,
  onEnhanceChange,
  onOpenSettings,
  onSend,
}) => {
  const formatMenu = (
    <Menu selectedKeys={[format]} onClickMenuItem={(key) => onFormatChange(key as FormatPreset)}>
      {formats.map((f) => (
        <Menu.Item key={f}>{FORMAT_LABELS[f] ?? f}</Menu.Item>
      ))}
    </Menu>
  );

  const enhanceMenu = (
    <Menu
      selectedKeys={[enhance ? "on" : "off"]}
      onClickMenuItem={(key) => onEnhanceChange(key === "on")}
    >
      <Menu.Item key="on">Enhance on</Menu.Item>
      <Menu.Item key="off">Enhance off</Menu.Item>
    </Menu>
  );

  const qualityMenu = (
    <Menu
      selectedKeys={[youtubeQuality]}
      onClickMenuItem={(key) => onYoutubeQualityChange?.(key as YoutubeQuality)}
    >
      {youtubeQualityChoices.map((q) => (
        <Menu.Item key={q}>{youtubeQualityLabel(q)}</Menu.Item>
      ))}
    </Menu>
  );

  const subsMenu = (
    <Menu
      selectedKeys={[subtitles]}
      onClickMenuItem={(key) => onSubtitlesChange?.(key as SubtitleMode)}
    >
      <Menu.Item key="none">No subtitles</Menu.Item>
      <Menu.Item key="separate">Separate file</Menu.Item>
      <Menu.Item key="embed">Embed in video</Menu.Item>
    </Menu>
  );

  const showYtQuality = showYoutubeQuality && format !== "audio-only" && onYoutubeQualityChange;
  const showYtSubs = showSubtitles && format !== "audio-only" && onSubtitlesChange;

  return (
    <div className={styles.actionRow}>
      <div className={styles.actionTools}>
        <div className={styles.actionEntry}>
          <Tooltip content={hasUrl ? "Clear" : "Paste from clipboard"}>
            <Button
              type="secondary"
              shape="circle"
              disabled={loading}
              aria-label={hasUrl ? "Clear" : "Paste from clipboard"}
              icon={
                hasUrl ? (
                  <Clear theme="outline" size={14} strokeWidth={2} fill="currentColor" />
                ) : (
                  <Plus theme="outline" size={14} strokeWidth={2} fill="currentColor" />
                )
              }
              onClick={onPasteOrClear}
            />
          </Tooltip>
        </div>

        {clipboardMonitor ? (
          <Tooltip content="Clipboard grabber active — copied links go to Tasks">
            <span className={styles.clipboardLive} aria-label="Clipboard grabber active">
              <LinkOne theme="outline" size={14} />
            </span>
          </Tooltip>
        ) : null}

        {leftOptions ? <div className={styles.actionLeftOptions}>{leftOptions}</div> : null}
      </div>

      <div className={styles.actionSubmit}>
        <div className={`${styles.actionConfigGroup} ${styles.actionConfigScroll}`}>
          <Dropdown droplist={formatMenu} trigger="click" position="top">
            <Button
              className="sendbox-model-btn guid-config-btn"
              shape="round"
              size="small"
              type="text"
            >
              <span className="inline-flex items-center gap-4px min-w-0">
                <Filter theme="outline" size={14} fill="currentColor" />
                <span className="guid-model-label">{FORMAT_LABELS[format] ?? format}</span>
                <Down theme="outline" size={12} fill="currentColor" />
              </span>
            </Button>
          </Dropdown>

          {showYtQuality ? (
            <Dropdown droplist={qualityMenu} trigger="click" position="top">
              <Button
                className="sendbox-model-btn guid-config-btn"
                shape="round"
                size="small"
                type="text"
              >
                <span className="inline-flex items-center gap-4px min-w-0">
                  <VideoOne theme="outline" size={14} fill="currentColor" />
                  <span className="guid-model-label">{youtubeQualityLabel(youtubeQuality)}</span>
                  <Down theme="outline" size={12} fill="currentColor" />
                </span>
              </Button>
            </Dropdown>
          ) : null}

          {showYtSubs ? (
            <Dropdown droplist={subsMenu} trigger="click" position="top">
              <Button
                className="sendbox-model-btn guid-config-btn"
                shape="round"
                size="small"
                type="text"
              >
                <span className="inline-flex items-center gap-4px min-w-0">
                  <Translation theme="outline" size={14} fill="currentColor" />
                  <span className="guid-model-label">{SUBTITLE_LABELS[subtitles] ?? "Subs"}</span>
                  <Down theme="outline" size={12} fill="currentColor" />
                </span>
              </Button>
            </Dropdown>
          ) : null}

          {showEnhance ? (
            <Dropdown droplist={enhanceMenu} trigger="click" position="top">
              <Button
                className="sendbox-model-btn guid-config-btn"
                shape="round"
                size="small"
                type="text"
              >
                <span className="inline-flex items-center gap-4px min-w-0">
                  <Shield theme="outline" size={14} fill="currentColor" />
                  <span className="guid-model-label">{enhance ? "Enhance" : "Original"}</span>
                  <Down theme="outline" size={12} fill="currentColor" />
                </span>
              </Button>
            </Dropdown>
          ) : null}

          {onQueue ? (
            <Tooltip content="Add link to Tasks queue">
              <Button
                className="sendbox-model-btn guid-config-btn"
                shape="round"
                size="small"
                type="text"
                disabled={!canQueue || loading}
                onClick={onQueue}
              >
                <span className="inline-flex items-center gap-4px min-w-0">
                  <List theme="outline" size={14} fill="currentColor" />
                  <span className="guid-model-label">Queue</span>
                </span>
              </Button>
            </Tooltip>
          ) : null}

          {onOpenTasks ? (
            <Tooltip content="Open Tasks">
              <Badge count={queueCount > 0 ? queueCount : undefined} maxCount={99}>
                <Button
                  className="sendbox-model-btn guid-config-btn"
                  shape="circle"
                  size="small"
                  type="text"
                  icon={<List theme="outline" size={14} fill="currentColor" />}
                  onClick={onOpenTasks}
                  aria-label="Open Tasks"
                />
              </Badge>
            </Tooltip>
          ) : null}

          {onOpenSettings ? (
            <Tooltip content="Download settings">
              <Button
                className="sendbox-model-btn guid-config-btn"
                shape="circle"
                size="small"
                type="text"
                icon={<SettingTwo theme="outline" size={14} fill="currentColor" />}
                onClick={onOpenSettings}
              />
            </Tooltip>
          ) : null}
        </div>

        <Button
          shape="circle"
          type="primary"
          loading={loading}
          disabled={disabled}
          className="send-button-custom"
          style={{
            backgroundColor: disabled ? undefined : "#000000",
            borderColor: disabled ? undefined : "#000000",
          }}
          icon={<ArrowUp theme="filled" size={14} fill="white" strokeWidth={5} />}
          onClick={onSend}
        />
      </div>
    </div>
  );
};

export default GuidHomeActionRow;

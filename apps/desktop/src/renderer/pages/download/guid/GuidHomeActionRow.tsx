import React from "react";
import { Button, Dropdown, Menu, Tooltip } from "@arco-design/web-react";
import { ArrowUp, Clear, Down, Plus, Shield, Filter, SettingTwo } from "@icon-park/react";
import type { FormatPreset } from "@renderer/api";
import styles from "./guid.module.css";

type GuidHomeActionRowProps = {
  hasUrl: boolean;
  loading: boolean;
  disabled: boolean;
  format: FormatPreset;
  formats?: FormatPreset[];
  enhance: boolean;
  showEnhance?: boolean;
  onPasteOrClear: () => void;
  onFormatChange: (format: FormatPreset) => void;
  onEnhanceChange: (enhance: boolean) => void;
  onOpenSettings?: () => void;
  onSend: () => void;
};

const FORMAT_LABELS: Record<FormatPreset, string> = {
  best: "Best quality",
  mp4: "MP4",
  "audio-only": "Audio only",
};

/**
 * AionUI GuidActionRow shell: plus | format + enhance | send.
 */
const GuidHomeActionRow: React.FC<GuidHomeActionRowProps> = ({
  hasUrl,
  loading,
  disabled,
  format,
  formats = ["best", "mp4", "audio-only"],
  enhance,
  showEnhance = true,
  onPasteOrClear,
  onFormatChange,
  onEnhanceChange,
  onOpenSettings,
  onSend,
}) => {
  const formatMenu = (
    <Menu
      selectedKeys={[format]}
      onClickMenuItem={(key) => onFormatChange(key as FormatPreset)}
    >
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
      </div>

      <div className={styles.actionSubmit}>
        <div className={styles.actionConfigGroup}>
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
                  <span className="guid-model-label">
                    {enhance ? "Enhance" : "Original"}
                  </span>
                  <Down theme="outline" size={12} fill="currentColor" />
                </span>
              </Button>
            </Dropdown>
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

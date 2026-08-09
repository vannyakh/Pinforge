import React, { useRef } from "react";
import { Input } from "@arco-design/web-react";
import type { RefTextAreaType } from "@arco-design/web-react/es/Input";
import { useInputFocusRing } from "@renderer/hooks/chat/useInputFocusRing";
import GuidHomeWorkspaceFootnote from "./GuidHomeWorkspaceFootnote";
import styles from "./guid.module.css";

type GuidHomeInputCardProps = {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onFocus: () => void;
  onBlur: () => void;
  placeholder?: string;
  isInputActive: boolean;
  disabled?: boolean;
  actionRow: React.ReactNode;
  /** Optional row under the textarea (e.g. Get playlist checkbox). */
  optionsRow?: React.ReactNode;
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
};

/**
 * AionUI GuidInputCard — nested shell + inner card + workspace footnote.
 */
const GuidHomeInputCard: React.FC<GuidHomeInputCardProps> = ({
  input,
  onInputChange,
  onKeyDown,
  onFocus,
  onBlur,
  placeholder = "Paste a media URL, or type a link to download…",
  isInputActive,
  disabled,
  actionRow,
  optionsRow,
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
  textareaRef,
}) => {
  const { activeBorderColor, inactiveBorderColor, activeShadow } = useInputFocusRing();
  const innerRef = useRef<RefTextAreaType | null>(null);

  const borderColor = isInputActive ? activeBorderColor : inactiveBorderColor;

  return (
    <div
      className={`${styles.guidInputCardWrap} guid-input-card-shell relative rd-24px flex flex-col overflow-hidden transition-all duration-200`}
      style={{
        zIndex: 1,
        transition: "box-shadow 0.25s ease",
        boxShadow: isInputActive ? activeShadow : "none",
      }}
    >
      <div
        className={`${styles.guidInputInner} relative p-12px flex flex-col`}
        style={{
          transition: "box-shadow 0.25s ease, border-color 0.25s ease",
          borderColor,
          boxShadow: isInputActive ? activeShadow : "none",
        }}
      >
        <Input.TextArea
          ref={(node) => {
            innerRef.current = node;
            if (textareaRef && "current" in textareaRef) {
              (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current =
                node?.dom ?? null;
            }
          }}
          autoSize={{ minRows: 2, maxRows: 8 }}
          placeholder={placeholder}
          spellCheck={false}
          disabled={disabled}
          className={`text-14px focus:b-none rounded-xl !bg-transparent !b-none !resize-none !py-0 !pr-0 !pl-7px ${styles.lightPlaceholder}`}
          value={input}
          onChange={onInputChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        <div style={{ height: 12, flexShrink: 0 }} aria-hidden="true" />
        {optionsRow ? <div className="home-composer-options">{optionsRow}</div> : null}
        {actionRow}
      </div>

      <GuidHomeWorkspaceFootnote
        workspaceDir={workspaceDir}
        onSelectWorkspace={onSelectWorkspace}
        onClearWorkspace={onClearWorkspace}
      />
    </div>
  );
};

export default GuidHomeInputCard;

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModalProps } from "@arco-design/web-react";
import { Modal, Button } from "@arco-design/web-react";
import { Close } from "@icon-park/react";
import classNames from "classnames";
import type { CSSProperties } from "react";
import React from "react";
import { useThemeContext } from "@renderer/hooks/context/ThemeContext";

/** Preset size type */
export type ModalSize = "small" | "medium" | "large" | "xlarge" | "full";

/** Preset size config */
export const MODAL_SIZES: Record<ModalSize, { width: string; height?: string }> = {
  small: { width: "400px", height: "300px" },
  medium: { width: "600px", height: "400px" },
  large: { width: "800px", height: "600px" },
  xlarge: { width: "1000px", height: "700px" },
  full: { width: "90vw", height: "90vh" },
};

/** Header config */
export interface ModalHeaderConfig {
  /** Custom full header content */
  render?: () => React.ReactNode;
  /** Title text or node */
  title?: React.ReactNode;
  /** Optional subtitle — omitted entirely when unset */
  subtitle?: React.ReactNode;
  /** Show close button */
  showClose?: boolean;
  /** Close button icon */
  closeIcon?: React.ReactNode;
  /** Extra header className */
  className?: string;
  /** Extra header style */
  style?: CSSProperties;
}

/** Footer config */
export interface ModalFooterConfig {
  /** Custom full footer content */
  render?: () => React.ReactNode;
  /** Extra footer className */
  className?: string;
  /** Extra footer style */
  style?: CSSProperties;
  /**
   * When true, render the standard top divider + padding.
   * Default false for gradual migration.
   */
  divider?: boolean;
}

/** Modal body style config */
export interface ModalContentStyleConfig {
  background?: string;
  borderRadius?: string | number;
  padding?: string | number;
  overflow?: "auto" | "scroll" | "hidden" | "visible";
  height?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
}

/** AionModal props */
export interface AionModalProps extends Omit<ModalProps, "title" | "footer"> {
  children?: React.ReactNode;

  /**
   * Layout variant. `standard` uses the 3-section layout:
   * header (padding + bottom rule) / body (padding, scroll) / footer (top rule + padding).
   */
  variant?: "standard";

  /** Preset size; overridden by style width/height */
  size?: ModalSize;

  /** Header: title node or full config */
  header?: React.ReactNode | ModalHeaderConfig;

  /** Footer: ReactNode, config, or null to hide */
  footer?: React.ReactNode | ModalFooterConfig | null;

  /** Body style config */
  contentStyle?: ModalContentStyleConfig;

  /** @deprecated use header.title */
  title?: React.ReactNode;
  /** @deprecated use header.showClose */
  showCustomClose?: boolean;
}

const HEADER_BASE_CLASS = "flex items-center justify-between pb-20px";
const TITLE_BASE_CLASS = "text-18px font-500 text-t-primary m-0";
const CLOSE_BUTTON_CLASS =
  "w-32px h-32px flex items-center justify-center rd-8px transition-colors duration-200 cursor-pointer border-0 bg-transparent p-0 hover:bg-2 focus:outline-none";
const FOOTER_BASE_CLASS = "flex-shrink-0 bg-transparent";
const FOOTER_DIVIDER_CLASS =
  "flex-shrink-0 border-t border-solid border-[var(--bg-3)] px-24px py-16px";

const STD_HEADER_CLASS =
  "aionui-modal-std-header flex items-start justify-between gap-16px px-24px pt-20px pb-16px";
const STD_TITLE_CLASS = "text-18px font-600 leading-26px text-t-primary m-0";
const STD_SUBTITLE_CLASS = "text-13px leading-20px text-t-secondary m-0 mt-4px";
const STD_BODY_LAYOUT_CLASS = "aionui-modal-std-body min-h-0 flex-1 overflow-y-auto";
const STD_BODY_PADDING_CLASS = "px-24px py-20px";
const STD_CLOSE_BTN_CLASS =
  "shrink-0 w-32px h-32px flex items-center justify-center rd-8px transition-colors duration-200 cursor-pointer border-0 bg-transparent p-0 text-t-secondary hover:bg-fill-2 focus:outline-none";

const dimensionKeys = [
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "minHeight",
  "maxHeight",
] as const;
type DimensionKey = (typeof dimensionKeys)[number];

const formatDimensionValue = (value?: string | number) => {
  if (value === undefined || value === null) return undefined;
  return typeof value === "number" ? `${value}px` : value;
};

const AionModal: React.FC<AionModalProps> = ({
  children,
  variant,
  size,
  header,
  footer,
  contentStyle,
  title,
  showCustomClose = true,
  onCancel,
  className = "",
  style,
  ...props
}) => {
  const isStandard = variant === "standard";
  const { fontScale } = useThemeContext();
  const stdBodyHasCustomPadding = isStandard && contentStyle?.padding !== undefined;
  const contentBg = contentStyle?.background || "var(--dialog-fill-0)";
  const contentBorderRadius = contentStyle?.borderRadius || "16px";
  const contentPadding = contentStyle?.padding || "0";
  const contentOverflow = contentStyle?.overflow || "auto";

  const borderRadiusVal =
    typeof contentBorderRadius === "number" ? `${contentBorderRadius}px` : contentBorderRadius;
  const paddingVal = typeof contentPadding === "number" ? `${contentPadding}px` : contentPadding;

  const safeScale = fontScale > 0 ? fontScale : 1;

  const scaleDimension = (value: CSSProperties["width"]): CSSProperties["width"] => {
    if (value === undefined || value === null) return value;
    if (typeof value === "number") {
      return Number((value / safeScale).toFixed(2));
    }
    const match = /^([0-9]+(?:\.[0-9]+)?)px$/i.exec(value.trim());
    if (match) {
      return `${parseFloat(match[1]) / safeScale}px`;
    }
    return value;
  };

  const modalSize = size ? MODAL_SIZES[size] : undefined;
  const baseStyle: CSSProperties = {
    ...modalSize,
    ...style,
  };

  type DimensionStyle = Partial<Pick<CSSProperties, DimensionKey>>;
  const scaledStyle: DimensionStyle = {};
  dimensionKeys.forEach((key) => {
    const raw = baseStyle[key];
    if (raw !== undefined) {
      scaledStyle[key] = scaleDimension(
        raw as CSSProperties["width"]
      ) as CSSProperties[DimensionKey];
    }
  });

  const mergedStyle: CSSProperties = {
    ...baseStyle,
    ...scaledStyle,
  };

  if (typeof window !== "undefined") {
    const viewportGap = 32;
    if (!mergedStyle.maxWidth) {
      mergedStyle.maxWidth = `calc(100vw - ${viewportGap}px)`;
    }
    if (!mergedStyle.maxHeight) {
      mergedStyle.maxHeight = `calc(100vh - ${viewportGap}px)`;
    }
  }

  const finalStyle: CSSProperties = {
    ...mergedStyle,
    borderRadius: mergedStyle.borderRadius ?? "16px",
  };

  const bodyInlineStyle = React.useMemo<CSSProperties>(() => {
    const next: CSSProperties = {
      background: contentBg,
      overflow: contentOverflow,
    };

    (["height", "minHeight", "maxHeight"] as const).forEach((key) => {
      const value = contentStyle?.[key];
      if (value !== undefined) {
        next[key] = formatDimensionValue(value);
      }
    });

    return next;
  }, [
    contentBg,
    contentOverflow,
    contentStyle?.height,
    contentStyle?.maxHeight,
    contentStyle?.minHeight,
  ]);

  const headerConfig: ModalHeaderConfig = React.useMemo(() => {
    if (header !== undefined) {
      if (typeof header === "string" || React.isValidElement(header)) {
        return {
          title: header,
          showClose: true,
        };
      }
      return header as ModalHeaderConfig;
    }
    return {
      title,
      showClose: showCustomClose,
    };
  }, [header, title, showCustomClose]);

  const footerConfig: ModalFooterConfig | null = React.useMemo(() => {
    if (footer === null) {
      return null;
    }

    if (footer === undefined) {
      const cancelLabel = props.cancelText ?? "Cancel";
      const okLabel = props.okText ?? "Confirm";
      return {
        render: () => (
          <div className="flex justify-end gap-10px">
            <Button onClick={onCancel} className="px-20px min-w-80px" style={{ borderRadius: 8 }}>
              {cancelLabel}
            </Button>
            <Button
              type="primary"
              onClick={() => {
                void props.onOk?.();
              }}
              loading={props.confirmLoading}
              className="px-20px min-w-80px"
              style={{ borderRadius: 8 }}
            >
              {okLabel}
            </Button>
          </div>
        ),
      };
    }

    if (React.isValidElement(footer)) {
      return {
        render: () => footer,
      };
    }
    return footer as ModalFooterConfig;
  }, [footer, onCancel, props.cancelText, props.okText, props.onOk, props.confirmLoading]);

  const renderHeader = () => {
    if (headerConfig.render) {
      return (
        <div className={headerConfig.className} style={headerConfig.style}>
          {headerConfig.render()}
        </div>
      );
    }

    if (!headerConfig.title && !headerConfig.showClose) {
      return null;
    }

    if (isStandard) {
      return (
        <div
          className={classNames(STD_HEADER_CLASS, headerConfig.className)}
          style={headerConfig.style}
        >
          <div className="min-w-0 flex-1">
            {headerConfig.title && <h3 className={STD_TITLE_CLASS}>{headerConfig.title}</h3>}
            {headerConfig.subtitle ? (
              <p className={STD_SUBTITLE_CLASS}>{headerConfig.subtitle}</p>
            ) : null}
          </div>
          {headerConfig.showClose && (
            <button
              type="button"
              onClick={onCancel}
              className={STD_CLOSE_BTN_CLASS}
              aria-label="Close"
            >
              {headerConfig.closeIcon || <Close size={20} fill="currentColor" />}
            </button>
          )}
        </div>
      );
    }

    const headerClassName = classNames(HEADER_BASE_CLASS, headerConfig.className);
    const headerStyle: CSSProperties = {
      borderBottom: "1px solid var(--bg-3)",
      ...headerConfig.style,
    };

    return (
      <div className={headerClassName} style={headerStyle}>
        {headerConfig.title && <h3 className={TITLE_BASE_CLASS}>{headerConfig.title}</h3>}
        {headerConfig.showClose && (
          <button
            type="button"
            onClick={onCancel}
            className={CLOSE_BUTTON_CLASS}
            aria-label="Close"
          >
            {headerConfig.closeIcon || <Close size={20} fill="#86909c" />}
          </button>
        )}
      </div>
    );
  };

  const renderFooter = () => {
    if (!footerConfig) {
      return null;
    }

    if (footerConfig.render) {
      const useDivider = isStandard || footerConfig.divider === true;
      const footerClassName = classNames(
        useDivider ? FOOTER_DIVIDER_CLASS : FOOTER_BASE_CLASS,
        isStandard && "aionui-modal-std-footer",
        footerConfig.className
      );
      return (
        <div className={footerClassName} style={footerConfig.style}>
          {footerConfig.render()}
        </div>
      );
    }

    return null;
  };

  return (
    <Modal
      {...props}
      title={null}
      closable={false}
      footer={null}
      onCancel={onCancel}
      className={classNames("aionui-modal", isStandard && "aionui-modal-standard", className)}
      style={finalStyle}
      getPopupContainer={() => document.body}
    >
      <div
        className={classNames("aionui-modal-wrapper", isStandard && "flex flex-col min-h-0")}
        style={{ borderRadius: borderRadiusVal }}
      >
        {renderHeader()}
        <div
          className={classNames(
            "aionui-modal-body-content",
            isStandard && STD_BODY_LAYOUT_CLASS,
            isStandard && !stdBodyHasCustomPadding && STD_BODY_PADDING_CLASS
          )}
          style={
            stdBodyHasCustomPadding ? { ...bodyInlineStyle, padding: paddingVal } : bodyInlineStyle
          }
        >
          {children}
        </div>
        {renderFooter()}
      </div>
    </Modal>
  );
};

AionModal.displayName = "AionModal";

export default AionModal;

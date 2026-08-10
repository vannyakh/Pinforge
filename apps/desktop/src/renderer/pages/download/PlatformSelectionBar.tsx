import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@arco-design/web-react";
import { Down } from "@icon-park/react";
import { PlatformIcon, PLATFORMS, type PlatformId } from "./platforms";
import styles from "./guid/guid.module.css";

export type PlatformFilter = PlatformId | "auto";

type PlatformOption = {
  id: PlatformFilter;
  label: string;
  live: boolean;
};

const OPTIONS: PlatformOption[] = [
  { id: "auto", label: "Auto", live: true },
  ...PLATFORMS.map((p) => ({ id: p.id, label: p.label, live: p.live })),
];

export function resolvePlatformVisibleLimit(width: number): number {
  if (width >= 720) return 4;
  if (width >= 600) return 3;
  if (width >= 460) return 2;
  return 1;
}

export function hasTruncatedPlatformLabels(root: HTMLElement | null): boolean {
  if (!root) return false;
  return Array.from(root.querySelectorAll<HTMLElement>('[data-platform-label="true"]')).some(
    (el) => el.scrollWidth > el.clientWidth + 1
  );
}

interface PlatformSelectionBarProps {
  value: PlatformFilter;
  detectedId?: PlatformId | null;
  onChange: (id: PlatformFilter) => void;
  maxVisible?: number;
}

/** AionUI AssistantSelectionArea layout — platform pills. */
const PlatformSelectionBar: React.FC<PlatformSelectionBarProps> = ({
  value,
  detectedId = null,
  onChange,
  maxVisible = 4,
}) => {
  const [moreVisible, setMoreVisible] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerWidth
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hoverOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedId: PlatformFilter = detectedId ?? value;
  const widthVisibleLimit = Math.min(
    Math.max(1, maxVisible),
    resolvePlatformVisibleLimit(availableWidth)
  );
  const [adaptiveVisibleLimit, setAdaptiveVisibleLimit] = useState(widthVisibleLimit);
  const visibleLimit = Math.min(widthVisibleLimit, adaptiveVisibleLimit);

  const enabled = useMemo(() => OPTIONS.filter((o) => o.live), []);

  useEffect(() => {
    setAdaptiveVisibleLimit(widthVisibleLimit);
  }, [enabled.length, selectedId, widthVisibleLimit]);

  const clearHoverTimers = () => {
    if (hoverOpenTimer.current) {
      clearTimeout(hoverOpenTimer.current);
      hoverOpenTimer.current = null;
    }
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };

  useEffect(() => clearHoverTimers, []);

  useEffect(() => {
    const update = () => {
      setAvailableWidth(
        containerRef.current?.offsetWidth ||
          (typeof window === "undefined" ? 800 : window.innerWidth)
      );
    };
    update();
    const el = containerRef.current;
    if (el && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (typeof width === "number") setAvailableWidth(width);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!moreVisible) return;
    const onPointer = (event: MouseEvent) => {
      if (
        barRef.current &&
        event.target instanceof Node &&
        !barRef.current.contains(event.target)
      ) {
        setMoreVisible(false);
      }
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreVisible(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onEsc);
    };
  }, [moreVisible]);

  const visibleOptions = useMemo(() => {
    if (enabled.length <= visibleLimit) return enabled.slice(0, visibleLimit);
    const selectedIndex = enabled.findIndex((o) => o.id === selectedId);
    if (selectedIndex < 0 || selectedIndex < visibleLimit) {
      return enabled.slice(0, visibleLimit);
    }
    return [...enabled.slice(0, visibleLimit - 1), enabled[selectedIndex]];
  }, [enabled, selectedId, visibleLimit]);

  useLayoutEffect(() => {
    if (visibleLimit <= 1 || !hasTruncatedPlatformLabels(containerRef.current)) return;
    setAdaptiveVisibleLimit((current) => Math.max(1, Math.min(current, visibleLimit) - 1));
  }, [visibleOptions, visibleLimit]);

  const hasOverflow = enabled.length > visibleOptions.length;
  const overflowOptions = useMemo(() => {
    const ids = new Set(visibleOptions.map((o) => o.id));
    return enabled.filter((o) => !ids.has(o.id));
  }, [enabled, visibleOptions]);
  const overflowColumns = widthVisibleLimit;

  const handleBarMouseEnter = () => {
    if (!hasOverflow) return;
    clearHoverTimers();
    hoverOpenTimer.current = setTimeout(() => setMoreVisible(true), 120);
  };

  const handleBarMouseLeave = () => {
    if (!hasOverflow) return;
    clearHoverTimers();
    hoverCloseTimer.current = setTimeout(() => setMoreVisible(false), 240);
  };

  const renderPill = (option: PlatformOption, fullWidth = false) => {
    const isSelected = selectedId === option.id;
    return (
      <Button
        key={option.id}
        type="text"
        data-platform-id={option.id}
        data-platform-selected={isSelected ? "true" : "false"}
        className={`!inline-flex !min-w-0 !h-auto !items-center !gap-6px !rounded-999px !border-none !px-12px !py-8px !text-13px transition-all ${
          fullWidth ? "!w-full !justify-start" : ""
        } ${
          isSelected
            ? "font-600 text-t-primary shadow-sm"
            : `text-t-secondary opacity-75 hover:opacity-100 ${styles.assistantSelectorInactive}`
        }`}
        style={isSelected ? { background: "var(--bg-base, #fff)" } : { background: "transparent" }}
        onClick={() => {
          onChange(option.id);
          setMoreVisible(false);
        }}
      >
        <span className="inline-flex h-20px w-20px items-center justify-center overflow-hidden rounded-999px bg-fill-2">
          {option.id === "auto" ? (
            <span
              className="inline-block h-8px w-8px rounded-999px"
              style={{ background: "var(--text-secondary)" }}
            />
          ) : (
            <PlatformIcon id={option.id} size={14} />
          )}
        </span>
        <span data-platform-label="true" className="min-w-0 max-w-180px truncate whitespace-nowrap">
          {option.label}
        </span>
      </Button>
    );
  };

  return (
    <div ref={containerRef} className="mt-18px mb-16px w-full">
      <div className="flex w-full justify-center">
        <div
          ref={barRef}
          className="relative inline-flex max-w-full items-center rounded-999px px-6px py-6px"
          style={{ background: "var(--color-guid-agent-bar, var(--aou-2))" }}
          onMouseEnter={hasOverflow ? handleBarMouseEnter : undefined}
          onMouseLeave={hasOverflow ? handleBarMouseLeave : undefined}
        >
          <div className="flex min-w-0 max-w-full items-center gap-6px">
            {visibleOptions.map((option) => renderPill(option))}
            {hasOverflow ? (
              <Button
                type="text"
                className={`!ml-6px !inline-flex !h-34px !shrink-0 !items-center !gap-4px !rounded-999px !border-none !px-12px !py-8px !text-13px !text-t-secondary opacity-75 transition-opacity hover:opacity-100 ${styles.assistantSelectorInactive}`}
                onClick={() => setMoreVisible((v) => !v)}
              >
                <span>More</span>
                <Down theme="outline" size={14} />
              </Button>
            ) : null}
          </div>

          {hasOverflow && moreVisible ? (
            <div
              className={`absolute left-0 top-[calc(100%+8px)] z-100 w-full rounded-12px border border-border-2 p-8px shadow-lg ${styles.assistantOverflowPanel}`}
              style={{
                background: "var(--bg-base, #fff)",
                gridTemplateColumns: `repeat(${overflowColumns}, minmax(0, 1fr))`,
                display: "grid",
                gap: 6,
              }}
            >
              {overflowOptions.map((option) => (
                <div key={option.id} className="min-w-0">
                  {renderPill(option, true)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PlatformSelectionBar;

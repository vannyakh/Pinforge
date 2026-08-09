import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Tooltip } from "@arco-design/web-react";
import { Down, SettingTwo } from "@icon-park/react";
import { useNavigate } from "react-router-dom";
import { PlatformIcon, PLATFORMS, type PlatformId } from "./platforms";

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

const PlatformSelectionBar: React.FC<PlatformSelectionBarProps> = ({
  value,
  detectedId = null,
  onChange,
  maxVisible = 4,
}) => {
  const navigate = useNavigate();
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
        containerRef.current?.offsetWidth || (typeof window === "undefined" ? 800 : window.innerWidth)
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
      if (barRef.current && event.target instanceof Node && !barRef.current.contains(event.target)) {
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
      <button
        key={option.id}
        type="button"
        data-platform-id={option.id}
        data-platform-selected={isSelected ? "true" : "false"}
        className={`home-platform-pill ${isSelected ? "is-active" : "is-inactive"} ${
          fullWidth ? "home-platform-pill--full" : ""
        }`}
        onClick={() => {
          onChange(option.id);
          setMoreVisible(false);
        }}
      >
        <span className="home-platform-pill__avatar">
          {option.id === "auto" ? (
            <span className="home-platform-pill__dot home-platform-pill__dot--auto" />
          ) : (
            <PlatformIcon id={option.id} size={14} />
          )}
        </span>
        <span data-platform-label="true" className="home-platform-pill__label">
          {option.label}
        </span>
      </button>
    );
  };

  return (
    <div ref={containerRef} className="home-platform-bar-wrap">
      <div className="home-platform-bar-center">
        <div
          ref={barRef}
          className="home-platform-bar"
          onMouseEnter={handleBarMouseEnter}
          onMouseLeave={handleBarMouseLeave}
        >
          <div className="home-platform-bar__row">
            {visibleOptions.map((option) => renderPill(option))}
            {hasOverflow ? (
              <Button
                type="text"
                className="home-platform-more"
                onClick={() => setMoreVisible((v) => !v)}
              >
                <span>More</span>
                <Down theme="outline" size={14} />
              </Button>
            ) : null}
          </div>

          {hasOverflow && moreVisible ? (
            <div
              className="home-platform-overflow"
              style={{ gridTemplateColumns: `repeat(${overflowColumns}, minmax(0, 1fr))` }}
            >
              {overflowOptions.map((option) => (
                <div key={option.id} className="min-w-0">
                  {renderPill(option, true)}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <Tooltip content="Download settings">
          <button
            type="button"
            className="home-platform-config"
            aria-label="Download settings"
            onClick={() => void navigate("/settings/download")}
          >
            <SettingTwo theme="outline" size="16" fill="currentColor" strokeWidth={3} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default PlatformSelectionBar;

import React from "react";
import classNames from "classnames";
import { ArrowLeft, ArrowRight, Search } from "@icon-park/react";
import { useLayoutContext } from "@renderer/hooks/context/LayoutContext";
import { useNavigationHistory } from "@renderer/hooks/context/NavigationHistoryContext";
import WindowControls from "../WindowControls";
import logoUrl from "@renderer/assets/logo.png";
import TitlebarSearch from "./TitlebarSearch";
import "./titlebar.css";

const SidebarIcon: React.FC<{ size?: number; strokeWidth?: number }> = ({
  size = 18,
  strokeWidth = 4,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="6" y="10" width="36" height="28" rx="5" />
    <line x1="18" y1="10" x2="18" y2="38" />
  </svg>
);

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const ICON_SIZE = 18;
const ICON_STROKE = 3;

const Titlebar: React.FC<{ hideSiderToggle?: boolean }> = ({ hideSiderToggle = false }) => {
  const { toggleSider, isMobile } = useLayoutContext();
  const navigationHistory = useNavigationHistory();
  const showHistoryNav = Boolean(navigationHistory) && !isMobile;
  const showSearch = !isMobile;

  return (
    <div
      className={classNames("app-titlebar app-titlebar--desktop", {
        "app-titlebar--mac": isMac,
      })}
      style={{ background: "var(--bg-1)", borderBottom: "1px solid var(--border-base)" }}
    >
      <div className="app-titlebar__menu">
        {!hideSiderToggle && (
          <button
            type="button"
            className="app-titlebar__button"
            onClick={toggleSider}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
          >
            <SidebarIcon size={ICON_SIZE} strokeWidth={2.5} />
          </button>
        )}

        {showSearch && (
          <TitlebarSearch
            renderTrigger={({ onClick }) => (
              <button
                type="button"
                className="app-titlebar__button"
                onClick={onClick}
                title="Search"
                aria-label="Search"
              >
                <Search
                  theme="outline"
                  size={ICON_SIZE}
                  fill="currentColor"
                  strokeWidth={ICON_STROKE}
                />
              </button>
            )}
          />
        )}

        {showHistoryNav && (
          <>
            <button
              type="button"
              className="app-titlebar__button app-titlebar__button--nav"
              onClick={() => navigationHistory?.back()}
              disabled={!navigationHistory?.canBack}
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft
                theme="outline"
                size={ICON_SIZE}
                fill="currentColor"
                strokeWidth={ICON_STROKE}
              />
            </button>
            <button
              type="button"
              className="app-titlebar__button app-titlebar__button--nav"
              onClick={() => navigationHistory?.forward()}
              disabled={!navigationHistory?.canForward}
              title="Forward"
              aria-label="Forward"
            >
              <ArrowRight
                theme="outline"
                size={ICON_SIZE}
                fill="currentColor"
                strokeWidth={ICON_STROKE}
              />
            </button>
          </>
        )}
      </div>

      <div className="app-titlebar__brand">
        <img src={logoUrl} alt="" className="size-16px rd-full object-cover" draggable={false} />
        <span>Pinforge</span>
      </div>

      <div className="app-titlebar__toolbar">{!isMac && <WindowControls />}</div>
    </div>
  );
};

export default Titlebar;

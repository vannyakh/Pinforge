import React from "react";
import classNames from "classnames";
import { useLayoutContext } from "@renderer/hooks/context/LayoutContext";
import WindowControls from "../WindowControls";
import logoUrl from "@renderer/assets/logo.png";
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

const Titlebar: React.FC = () => {
  const { toggleSider } = useLayoutContext();

  return (
    <div
      className={classNames("app-titlebar app-titlebar--desktop", {
        "app-titlebar--mac": isMac,
      })}
      style={{ background: "var(--bg-1)", borderBottom: "1px solid var(--border-base)" }}
    >
      <div className="app-titlebar__menu">
        <button
          type="button"
          className="app-titlebar__button"
          onClick={toggleSider}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <SidebarIcon size={18} strokeWidth={2.5} />
        </button>
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

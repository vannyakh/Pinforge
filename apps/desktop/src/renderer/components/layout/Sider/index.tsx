import React from "react";
import classNames from "classnames";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Checklist,
  AlarmClock,
  Pic,
  SettingTwo,
  Moon,
  Sun,
} from "@icon-park/react";
import { Tag } from "@arco-design/web-react";
import { useThemeContext } from "@renderer/hooks/context/ThemeContext";
import { useLayoutContext } from "@renderer/hooks/context/LayoutContext";
import { useApp } from "@renderer/hooks/context/AppContext";
import siderStyles from "./Sider.module.css";

interface SiderProps {
  onSessionClick?: () => void;
  collapsed?: boolean;
}

const NAV = [
  { path: "/", label: "Home", Icon: Home, soon: false },
  { path: "/tasks", label: "Tasks", Icon: Checklist, soon: false },
  { path: "/schedule", label: "Schedule", Icon: AlarmClock, soon: true },
  { path: "/gallery", label: "Gallery", Icon: Pic, soon: false },
] as const;

const Sider: React.FC<SiderProps> = ({ onSessionClick, collapsed = false }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, setTheme } = useThemeContext();
  const { isMobile } = useLayoutContext();
  const { tasks } = useApp();
  const isSettings = pathname.startsWith("/settings");
  const runningCount = tasks.filter((t) => t.status === "running").length;

  const go = (path: string) => {
    void navigate(path);
    onSessionClick?.();
  };

  return (
    <div className="size-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2px">
        <div className={classNames("flex-1 min-h-0 overflow-y-auto", siderStyles.scrollArea)}>
          <div className="px-10px pt-4px pb-8px text-11px font-500 text-t-tertiary tracking-wide uppercase sider-section-title">
            {!collapsed && "Workspace"}
          </div>
          {NAV.map(({ path, label, Icon, soon }) => {
            const active = path === "/" ? pathname === "/" : pathname.startsWith(path);
            return (
              <button
                key={path}
                type="button"
                className={classNames(
                  "w-full flex items-center gap-10px rd-8px border-none cursor-pointer text-left font-inherit px-12px py-10px settings-sider__item",
                  active
                    ? "bg-primary-light-1 text-t-primary font-600"
                    : "bg-transparent text-t-secondary hover:bg-hover"
                )}
                onClick={() => go(path)}
                title={collapsed ? label : undefined}
              >
                <Icon theme="outline" size="18" fill="currentColor" strokeWidth={3} />
                {!collapsed && (
                  <span className="settings-sider__item-label flex-1 flex items-center justify-between gap-8px">
                    <span>{label}</span>
                    <span className="flex items-center gap-4px">
                      {path === "/tasks" && runningCount > 0 && (
                        <Tag size="small" color="arcoblue">
                          {runningCount}
                        </Tag>
                      )}
                      {soon && (
                        <Tag size="small" color="orangered">
                          Soon
                        </Tag>
                      )}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 flex flex-col gap-2px pb-8px pt-4px border-t border-b-base mx-4px">
        <button
          type="button"
          className={classNames(
            "w-full flex items-center gap-10px rd-8px border-none cursor-pointer text-left px-12px py-10px",
            isSettings
              ? "bg-primary-light-1 text-t-primary font-600"
              : "bg-transparent text-t-secondary hover:bg-hover"
          )}
          onClick={() => go("/settings")}
          title={collapsed ? "Settings" : undefined}
        >
          <SettingTwo theme="outline" size="18" fill="currentColor" strokeWidth={3} />
          {!collapsed && <span>Settings</span>}
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-10px rd-8px border-none cursor-pointer text-left px-12px py-10px bg-transparent text-t-secondary hover:bg-hover"
          onClick={() => void setTheme(theme === "dark" ? "light" : "dark")}
          title={collapsed ? "Theme" : undefined}
        >
          {theme === "dark" ? (
            <Sun theme="outline" size="18" fill="currentColor" strokeWidth={3} />
          ) : (
            <Moon theme="outline" size="18" fill="currentColor" strokeWidth={3} />
          )}
          {!collapsed && !isMobile && <span>{theme === "dark" ? "Light" : "Dark"}</span>}
        </button>
      </div>
    </div>
  );
};

export default Sider;

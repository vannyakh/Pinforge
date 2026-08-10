import React, { useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { NavLink, useLocation } from "react-router-dom";
import {
  ApplicationOne,
  Info,
  Platte,
  LinkCloud,
  Computer,
  Magic,
  Down,
  Right,
} from "@icon-park/react";
import siderStyles from "@renderer/components/layout/Sider/Sider.module.css";

const SECTIONS = [
  {
    group: "Application",
    collapsible: true,
    items: [
      { path: "appearance", label: "Appearance", Icon: Platte },
      { path: "remote", label: "Remote", Icon: LinkCloud },
      { path: "system", label: "System", Icon: Computer },
    ],
  },
  {
    group: "Download",
    collapsible: false,
    items: [
      { path: "download", label: "Features", Icon: Magic },
      { path: "providers", label: "Providers", Icon: ApplicationOne },
    ],
  },
  {
    group: "Other",
    collapsible: false,
    items: [{ path: "about", label: "About", Icon: Info }],
  },
] as const;

interface SettingsSiderProps {
  collapsed?: boolean;
  onItemClick?: () => void;
}

const STORAGE_KEY = "__pinforge_settings_groups";

function readCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const SettingsSider: React.FC<SettingsSiderProps> = ({ collapsed = false, onItemClick }) => {
  const { pathname } = useLocation();
  const [groupCollapsed, setGroupCollapsed] =
    useState<Record<string, boolean>>(readCollapsedGroups);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(groupCollapsed));
    } catch {
      /* ignore */
    }
  }, [groupCollapsed]);

  const activePath = useMemo(() => {
    const match = pathname.match(/^\/settings\/([^/]+)/);
    return match?.[1] ?? "system";
  }, [pathname]);

  const toggleGroup = (group: string) => {
    setGroupCollapsed((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <div
      className={classNames(
        "size-full flex flex-col gap-2px overflow-y-auto overflow-x-hidden settings-sider",
        siderStyles.scrollArea,
        { "settings-sider--collapsed": collapsed }
      )}
    >
      {SECTIONS.map((section) => {
        const isGroupCollapsed = Boolean(groupCollapsed[section.group]);
        const showItems = collapsed || !section.collapsible || !isGroupCollapsed;

        return (
          <div key={section.group} className="flex flex-col gap-2px">
            {!collapsed &&
              (section.collapsible ? (
                <button
                  type="button"
                  className="settings-sider__group-header settings-sider__group-header--toggle w-full flex items-center justify-between gap-8px px-12px mt-8px mb-2px h-28px border-none bg-transparent cursor-pointer text-left"
                  onClick={() => toggleGroup(section.group)}
                  aria-expanded={!isGroupCollapsed}
                >
                  <span className="text-12px font-500 text-t-tertiary tracking-wide uppercase">
                    {section.group}
                  </span>
                  {isGroupCollapsed ? (
                    <Right
                      theme="outline"
                      size="12"
                      fill="currentColor"
                      strokeWidth={3}
                      className="text-t-tertiary"
                    />
                  ) : (
                    <Down
                      theme="outline"
                      size="12"
                      fill="currentColor"
                      strokeWidth={3}
                      className="text-t-tertiary"
                    />
                  )}
                </button>
              ) : (
                <div className="settings-sider__group-header px-12px mt-8px mb-2px h-28px flex items-center text-12px font-500 text-t-tertiary tracking-wide uppercase select-none">
                  {section.group}
                </div>
              ))}

            {showItems &&
              section.items.map(({ path, label, Icon }) => {
                const to = `/settings/${path}`;
                const active =
                  path === "providers"
                    ? activePath === path || pathname.startsWith(`${to}/`)
                    : activePath === path;
                return (
                  <NavLink
                    key={path}
                    to={to}
                    onClick={onItemClick}
                    title={collapsed ? label : undefined}
                    className={classNames(
                      "settings-sider__item flex items-center gap-10px rd-8px no-underline text-13px h-34px shrink-0",
                      collapsed ? "w-full justify-center px-0" : "justify-start px-12px",
                      active ? "bg-3 text-t-primary font-600" : "text-t-secondary hover:bg-hover"
                    )}
                  >
                    <Icon theme="outline" size="16" fill="currentColor" strokeWidth={3} />
                    {!collapsed && <span className="settings-sider__item-label">{label}</span>}
                  </NavLink>
                );
              })}
          </div>
        );
      })}
    </div>
  );
};

export default SettingsSider;

import React, { useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { Menu, Tag, Modal, Notification } from "@arco-design/web-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Checklist,
  AlarmClock,
  SettingTwo,
  Moon,
  Sun,
  Left,
  Plus,
  Message as MessageIcon,
  Delete,
  LoadingFour,
  Share,
  LinkCloud,
} from "@icon-park/react";
import { useThemeContext } from "@renderer/hooks/context/ThemeContext";
import { useLayoutContext } from "@renderer/hooks/context/LayoutContext";
import { useApp } from "@renderer/hooks/context/AppContext";
import SettingsSider from "@renderer/pages/settings/components/SettingsSider";
import {
  selectRecentChats,
  chatSessionIsBusy,
  useHomeChatStore,
} from "@renderer/pages/download/homeChatStore";
import siderStyles from "./Sider.module.css";

const MenuItem = Menu.Item;
const SubMenu = Menu.SubMenu;

const OPEN_KEYS_STORAGE = "pinforge:sider-open-keys";

interface SiderProps {
  onSessionClick?: () => void;
  collapsed?: boolean;
}

const LAST_PATH_KEY = "pinforge:last-non-settings-path";

function readOpenKeys(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_KEYS_STORAGE);
    if (!raw) return ["publish"];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((k) => k === "publish") : ["publish"];
  } catch {
    return ["publish"];
  }
}

function routeSelectedKey(pathname: string, activeId: string | null): string {
  if (pathname === "/" && activeId) return `recent/${activeId}`;
  if (pathname === "/" || pathname === "") return "workspace/home";
  if (pathname.startsWith("/tasks")) return "workspace/tasks";
  if (pathname.startsWith("/posts")) return "publish/posts";
  if (pathname.startsWith("/publish")) return "publish/create";
  if (pathname.startsWith("/schedule")) return "workspace/schedule";
  return "workspace/home";
}

const SubMenuTitle: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <span className="app-sider-menu__title inline-flex items-center gap-8px min-w-0">
    <span className="app-sider-menu__title-icon shrink-0">{icon}</span>
    <span className="app-sider-menu__title-text">{label}</span>
  </span>
);

const Sider: React.FC<SiderProps> = ({ onSessionClick, collapsed = false }) => {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const { theme, setTheme } = useThemeContext();
  const { isMobile } = useLayoutContext();
  const { tasks, busy } = useApp();
  const sessions = useHomeChatStore((s) => s.sessions);
  const activeId = useHomeChatStore((s) => s.activeId);
  const liveMessages = useHomeChatStore((s) => s.messages);
  const extracting = useHomeChatStore((s) => s.extracting);
  const openChat = useHomeChatStore((s) => s.openChat);
  const newChat = useHomeChatStore((s) => s.newChat);
  const removeChat = useHomeChatStore((s) => s.removeChat);
  const isSettings = pathname.startsWith("/settings");
  const runningCount = tasks.filter((t) => t.status === "running").length;
  const tasksBusy = busy || runningCount > 0;
  const lastNonSettingsPathRef = useRef("/");
  const [openKeys, setOpenKeys] = useState<string[]>(readOpenKeys);

  const recent = useMemo(() => selectRecentChats(sessions, 14), [sessions]);
  const selectedKeys = useMemo(
    () => [routeSelectedKey(pathname, activeId)],
    [pathname, activeId]
  );

  useEffect(() => {
    if (pathname.startsWith("/posts") || pathname.startsWith("/publish")) {
      setOpenKeys((prev) => (prev.includes("publish") ? prev : [...prev, "publish"]));
    }
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/settings")) {
      const full = `${pathname}${search}${hash}`;
      lastNonSettingsPathRef.current = full;
      try {
        sessionStorage.setItem(LAST_PATH_KEY, full);
      } catch {
        /* ignore */
      }
    }
  }, [pathname, search, hash]);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEYS_STORAGE, JSON.stringify(openKeys));
    } catch {
      /* ignore */
    }
  }, [openKeys]);

  const go = (path: string) => {
    void navigate(path);
    onSessionClick?.();
  };

  const handleSettingsClick = () => {
    if (isSettings) {
      let target = lastNonSettingsPathRef.current || "/";
      try {
        const stored = sessionStorage.getItem(LAST_PATH_KEY);
        if (stored && !stored.startsWith("/settings")) target = stored;
      } catch {
        /* ignore */
      }
      go(target);
      return;
    }
    go("/settings/system");
  };

  const openRecent = (id: string) => {
    openChat(id);
    go("/");
  };

  const startNewChat = () => {
    newChat();
    go("/");
  };

  const onMenuClick = (key: string) => {
    if (key.startsWith("section-")) return;
    if (key === "recent/new") {
      startNewChat();
      return;
    }
    if (key.startsWith("recent/")) {
      openRecent(key.slice("recent/".length));
      return;
    }
    if (key.startsWith("workspace/")) {
      if (key === "workspace/schedule") return;
      go(key === "workspace/home" ? "/" : `/${key.replace("workspace/", "")}`);
      return;
    }
    if (key.startsWith("publish/")) {
      const action = key.replace("publish/", "");
      if (action === "posts") go("/posts");
      else if (action === "create") go("/publish");
    }
  };

  return (
    <div className="size-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2px">
        {isSettings ? (
          <SettingsSider collapsed={collapsed} onItemClick={onSessionClick} />
        ) : (
          <div
            className={classNames(
              "flex-1 min-h-0 overflow-y-auto flex flex-col px-4px",
              siderStyles.scrollArea,
              collapsed && "chat-history--truncated"
            )}
          >
            <Menu
              className={classNames("app-sider-menu", collapsed && "app-sider-menu--collapsed")}
              selectedKeys={selectedKeys}
              openKeys={openKeys}
              onClickMenuItem={onMenuClick}
              onClickSubMenu={(_key, keys) => setOpenKeys(keys.filter((k) => k === "publish"))}
            >
              <MenuItem key="section-workspace" disabled className="app-sider-section-label-item">
                Workspace
              </MenuItem>
              <MenuItem key="workspace/home">
                <span className="inline-flex items-center gap-8px">
                  <Home theme="outline" size="16" fill="currentColor" strokeWidth={3} />
                  Home
                </span>
              </MenuItem>
              <MenuItem key="workspace/tasks">
                <span className="inline-flex items-center gap-8px w-full">
                  {tasksBusy ? (
                    <LoadingFour
                      theme="outline"
                      size="16"
                      fill="currentColor"
                      strokeWidth={3}
                      className="sider-nav-spin shrink-0"
                    />
                  ) : (
                    <Checklist theme="outline" size="16" fill="currentColor" strokeWidth={3} />
                  )}
                  <span className="flex-1">Tasks</span>
                  {runningCount > 0 ? (
                    <Tag size="small" color="arcoblue">
                      {runningCount}
                    </Tag>
                  ) : null}
                </span>
              </MenuItem>
              <MenuItem key="workspace/schedule" disabled>
                <span className="inline-flex items-center gap-8px w-full">
                  <AlarmClock theme="outline" size="16" fill="currentColor" strokeWidth={3} />
                  <span className="flex-1">Schedule</span>
                  <Tag size="small" color="orangered">
                    Soon
                  </Tag>
                </span>
              </MenuItem>

              <SubMenu
                key="publish"
                title={
                  <SubMenuTitle
                    icon={<Share theme="outline" size="16" fill="currentColor" strokeWidth={3} />}
                    label="Publish"
                  />
                }
              >
                <MenuItem key="publish/create">
                  <span className="inline-flex items-center gap-8px">
                    <Share theme="outline" size="14" fill="currentColor" strokeWidth={3} />
                    Create post
                  </span>
                </MenuItem>
                <MenuItem key="publish/posts">
                  <span className="inline-flex items-center gap-8px">
                    <LinkCloud theme="outline" size="14" fill="currentColor" strokeWidth={3} />
                    Page posts
                  </span>
                </MenuItem>
              </SubMenu>

              <MenuItem key="section-recent" disabled className="app-sider-section-label-item">
                Recent
              </MenuItem>
              <MenuItem key="recent/new">
                <span className="inline-flex items-center gap-8px text-t-secondary">
                  <Plus theme="outline" size="14" fill="currentColor" strokeWidth={3} />
                  New chat
                </span>
              </MenuItem>
              {recent.length === 0 ? (
                <MenuItem key="recent/empty" disabled>
                  No chats yet
                </MenuItem>
              ) : (
                recent.map((chat) => {
                  const isActiveChat = activeId === chat.id;
                  const appBusy = busy || runningCount > 0;
                  const processing = chatSessionIsBusy(chat, {
                    extracting: isActiveChat && extracting,
                    liveMessages: isActiveChat ? liveMessages : undefined,
                    appBusy,
                  });
                  return (
                    <MenuItem key={`recent/${chat.id}`}>
                      <span className="inline-flex items-center gap-8px min-w-0 w-full group">
                        {processing ? (
                          <LoadingFour
                            theme="outline"
                            size="14"
                            fill="currentColor"
                            strokeWidth={3}
                            className="sider-nav-spin shrink-0"
                          />
                        ) : (
                          <MessageIcon
                            theme="outline"
                            size="14"
                            fill="currentColor"
                            strokeWidth={3}
                            className="shrink-0"
                          />
                        )}
                        <span className="flex-1 truncate">{chat.title}</span>
                        {!collapsed ? (
                          <button
                            type="button"
                            className="chat-history__item-delete opacity-0 group-hover:opacity-100 shrink-0 flex items-center justify-center w-20px h-20px rd-4px border-none cursor-pointer bg-transparent text-t-tertiary hover:text-danger"
                            aria-label="Remove chat"
                            onClick={(e) => {
                              e.stopPropagation();
                              Modal.confirm({
                                title: "Delete chat?",
                                content: `Are you sure you want to delete “${chat.title}”? This can’t be undone.`,
                                okText: "Delete",
                                okButtonProps: { status: "danger" },
                                onOk: () => {
                                  removeChat(chat.id);
                                  Notification.success({
                                    title: "Deleted",
                                    content: "Chat removed from Recent.",
                                  });
                                },
                              });
                            }}
                          >
                            <Delete theme="outline" size="12" fill="currentColor" strokeWidth={3} />
                          </button>
                        ) : null}
                      </span>
                    </MenuItem>
                  );
                })
              )}
            </Menu>
          </div>
        )}
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
          onClick={handleSettingsClick}
          title={collapsed ? (isSettings ? "Back" : "Settings") : undefined}
        >
          {isSettings ? (
            <Left theme="outline" size="18" fill="currentColor" strokeWidth={3} />
          ) : (
            <SettingTwo theme="outline" size="18" fill="currentColor" strokeWidth={3} />
          )}
          {!collapsed && <span>{isSettings ? "Back" : "Settings"}</span>}
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
export { LAST_PATH_KEY };

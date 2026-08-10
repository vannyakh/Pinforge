import React, { useEffect, useMemo, useRef } from "react";
import classNames from "classnames";
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
} from "@icon-park/react";
import { Tag, Tooltip, Modal, Notification } from "@arco-design/web-react";
import { useThemeContext } from "@renderer/hooks/context/ThemeContext";
import { useLayoutContext } from "@renderer/hooks/context/LayoutContext";
import { useApp } from "@renderer/hooks/context/AppContext";
import SettingsSider from "@renderer/pages/settings/components/SettingsSider";
import {
  selectRecentChats,
  useHomeChatStore,
  type ChatSession,
} from "@renderer/pages/download/homeChatStore";
import siderStyles from "./Sider.module.css";

interface SiderProps {
  onSessionClick?: () => void;
  collapsed?: boolean;
}

const NAV = [
  { path: "/", label: "Home", Icon: Home, soon: false },
  { path: "/tasks", label: "Tasks", Icon: Checklist, soon: false },
  { path: "/schedule", label: "Schedule", Icon: AlarmClock, soon: true },
] as const;

const LAST_PATH_KEY = "pinforge:last-non-settings-path";

function chatHasActiveProcess(chat: ChatSession): boolean {
  return chat.messages.some(
    (m) => m.role === "assistant" && (m.status === "started" || m.status === "detecting")
  );
}

const Sider: React.FC<SiderProps> = ({ onSessionClick, collapsed = false }) => {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const { theme, setTheme } = useThemeContext();
  const { isMobile } = useLayoutContext();
  const { tasks, busy } = useApp();
  const sessions = useHomeChatStore((s) => s.sessions);
  const activeId = useHomeChatStore((s) => s.activeId);
  const liveMessages = useHomeChatStore((s) => s.messages);
  const openChat = useHomeChatStore((s) => s.openChat);
  const newChat = useHomeChatStore((s) => s.newChat);
  const removeChat = useHomeChatStore((s) => s.removeChat);
  const isSettings = pathname.startsWith("/settings");
  const runningCount = tasks.filter((t) => t.status === "running").length;
  const tasksBusy = busy || runningCount > 0;
  const lastNonSettingsPathRef = useRef("/");

  const recent = useMemo(() => selectRecentChats(sessions, 14), [sessions]);

  const activeLiveBusy = useMemo(
    () =>
      liveMessages.some(
        (m) => m.role === "assistant" && (m.status === "started" || m.status === "detecting")
      ),
    [liveMessages]
  );

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

  return (
    <div className="size-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2px">
        {isSettings ? (
          <SettingsSider collapsed={collapsed} onItemClick={onSessionClick} />
        ) : (
          <div
            className={classNames(
              "flex-1 min-h-0 overflow-y-auto flex flex-col",
              siderStyles.scrollArea,
              collapsed && "chat-history--truncated"
            )}
          >
            <div className="px-10px pt-4px pb-8px text-11px font-500 text-t-tertiary tracking-wide uppercase sider-section-title">
              {!collapsed && "Workspace"}
            </div>
            {NAV.map(({ path, label, Icon, soon }) => {
              const active = path === "/" ? pathname === "/" : pathname.startsWith(path);
              const showTasksLoading = path === "/tasks" && tasksBusy;
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
                  {showTasksLoading ? (
                    <LoadingFour
                      theme="outline"
                      size="18"
                      fill="currentColor"
                      strokeWidth={3}
                      className="sider-nav-spin shrink-0"
                    />
                  ) : (
                    <Icon theme="outline" size="18" fill="currentColor" strokeWidth={3} />
                  )}
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

            <div className="chat-history__divider mx-10px my-10px" role="separator" />

            <div
              className={classNames(
                "chat-history flex-1 min-h-0 flex flex-col",
                collapsed && "chat-history--truncated"
              )}
            >
              <div className="chat-history__section px-10px pb-6px flex items-center justify-between gap-8px">
                {!collapsed && (
                  <span className="text-11px font-500 text-t-tertiary tracking-wide uppercase">
                    Recent
                  </span>
                )}
                <Tooltip content="New chat">
                  <button
                    type="button"
                    className="chat-history__new shrink-0 flex items-center justify-center w-24px h-24px rd-6px border-none cursor-pointer bg-transparent text-t-secondary hover:bg-hover hover:text-t-primary"
                    onClick={startNewChat}
                    aria-label="New chat"
                    title={collapsed ? "New chat" : undefined}
                  >
                    <Plus theme="outline" size="14" fill="currentColor" strokeWidth={3} />
                  </button>
                </Tooltip>
              </div>

              {recent.length === 0
                ? !collapsed && (
                    <div className="chat-history__placeholder px-12px py-8px text-12px text-t-tertiary">
                      Chats you start on Home show up here.
                    </div>
                  )
                : recent.map((chat) => {
                    const active = pathname === "/" && activeId === chat.id;
                    const processing =
                      (activeId === chat.id && activeLiveBusy) || chatHasActiveProcess(chat);
                    return (
                      <div
                        key={chat.id}
                        className={classNames(
                          "chat-history__item group w-full flex items-center gap-8px rd-8px px-10px py-8px cursor-pointer",
                          active
                            ? "chat-history__item--active bg-primary-light-1 text-t-primary"
                            : "text-t-secondary hover:bg-hover"
                        )}
                      >
                        <button
                          type="button"
                          className="flex-1 min-w-0 flex items-center gap-8px border-none bg-transparent cursor-pointer text-left font-inherit text-inherit p-0"
                          onClick={() => openRecent(chat.id)}
                          title={collapsed ? chat.title : undefined}
                        >
                          {processing ? (
                            <LoadingFour
                              theme="outline"
                              size="16"
                              fill="currentColor"
                              strokeWidth={3}
                              className="sider-nav-spin shrink-0"
                            />
                          ) : (
                            <MessageIcon
                              theme="outline"
                              size="16"
                              fill="currentColor"
                              strokeWidth={3}
                              className="shrink-0"
                            />
                          )}
                          {!collapsed && (
                            <span className="chat-history__item-name text-13px">{chat.title}</span>
                          )}
                        </button>
                        {!collapsed && (
                          <button
                            type="button"
                            className="chat-history__item-delete opacity-0 group-hover:opacity-100 shrink-0 flex items-center justify-center w-22px h-22px rd-4px border-none cursor-pointer bg-transparent text-t-tertiary hover:text-danger"
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
                        )}
                      </div>
                    );
                  })}
            </div>
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

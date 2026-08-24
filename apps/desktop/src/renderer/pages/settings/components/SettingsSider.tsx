import React, { useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { Menu } from "@arco-design/web-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ApplicationOne,
  Info,
  Platte,
  LinkCloud,
  Computer,
  Magic,
  Share,
} from "@icon-park/react";
import siderStyles from "@renderer/components/layout/Sider/Sider.module.css";

const MenuItem = Menu.Item;
const SubMenu = Menu.SubMenu;

const SECTIONS = [
  {
    key: "application",
    label: "Application",
    Icon: Platte,
    items: [
      { key: "appearance", label: "Appearance", Icon: Platte },
      { key: "publishing", label: "Publishing", Icon: Share },
      { key: "remote", label: "Remote", Icon: LinkCloud },
      { key: "agent", label: "Agent", Icon: ApplicationOne },
      { key: "system", label: "System", Icon: Computer },
    ],
  },
  {
    key: "download",
    label: "Download",
    Icon: Magic,
    items: [
      { key: "download", label: "Features", Icon: Magic },
      { key: "providers", label: "Providers", Icon: ApplicationOne },
    ],
  },
] as const;

const OPEN_KEYS_STORAGE = "__pinforge_settings_menu_open";

interface SettingsSiderProps {
  collapsed?: boolean;
  onItemClick?: () => void;
}

function readOpenKeys(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_KEYS_STORAGE);
    if (!raw) return ["application", "download"];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : ["application", "download"];
  } catch {
    return ["application", "download"];
  }
}

const SettingsSider: React.FC<SettingsSiderProps> = ({ collapsed = false, onItemClick }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [openKeys, setOpenKeys] = useState<string[]>(readOpenKeys);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEYS_STORAGE, JSON.stringify(openKeys));
    } catch {
      /* ignore */
    }
  }, [openKeys]);

  const selectedKey = useMemo(() => {
    const match = pathname.match(/^\/settings\/([^/]+)/);
    return match?.[1] ?? "system";
  }, [pathname]);

  const onMenuClick = (key: string) => {
    void navigate(`/settings/${key}`);
    onItemClick?.();
  };

  return (
    <div
      className={classNames(
        "size-full flex flex-col overflow-y-auto overflow-x-hidden settings-sider px-4px",
        siderStyles.scrollArea,
        { "settings-sider--collapsed": collapsed }
      )}
    >
      <Menu
        className={classNames("app-sider-menu", collapsed && "app-sider-menu--collapsed")}
        selectedKeys={[selectedKey]}
        openKeys={openKeys}
        onClickMenuItem={onMenuClick}
        onClickSubMenu={(_key, keys) => setOpenKeys(keys)}
      >
        {SECTIONS.map((section) => (
          <SubMenu
            key={section.key}
            title={
              <span className="app-sider-menu__title inline-flex items-center gap-8px min-w-0">
                <span className="app-sider-menu__title-icon shrink-0">
                  <section.Icon theme="outline" size="16" fill="currentColor" strokeWidth={3} />
                </span>
                <span className="app-sider-menu__title-text">{section.label}</span>
              </span>
            }
          >
            {section.items.map(({ key, label, Icon }) => (
              <MenuItem key={key}>
                <span className="inline-flex items-center gap-8px">
                  <Icon theme="outline" size="16" fill="currentColor" strokeWidth={3} />
                  {label}
                </span>
              </MenuItem>
            ))}
          </SubMenu>
        ))}
        <MenuItem key="about">
          <span className="inline-flex items-center gap-8px">
            <Info theme="outline" size="16" fill="currentColor" strokeWidth={3} />
            About
          </span>
        </MenuItem>
      </Menu>
    </div>
  );
};

export default SettingsSider;

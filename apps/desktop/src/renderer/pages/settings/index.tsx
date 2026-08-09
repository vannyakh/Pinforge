import React from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import classNames from "classnames";
import {
  SettingTwo,
  Download,
  ApplicationOne,
  Info,
  Platte,
  LinkCloud,
} from "@icon-park/react";
import GeneralSettings from "./General";
import DownloadSettings from "./Download";
import ProvidersSettings from "./Providers";
import AboutSettings from "./About";
import AppearanceSettings from "./Appearance";
import RemoteSettings from "./Remote";

const SECTIONS = [
  {
    group: "General",
    items: [
      { path: "general", label: "Preferences", Icon: SettingTwo },
      { path: "appearance", label: "Appearance", Icon: Platte },
    ],
  },
  {
    group: "Application",
    items: [{ path: "remote", label: "Remote", Icon: LinkCloud }],
  },
  {
    group: "Download",
    items: [
      { path: "download", label: "Output & format", Icon: Download },
      { path: "providers", label: "Providers", Icon: ApplicationOne },
    ],
  },
  {
    group: "Other",
    items: [{ path: "about", label: "About", Icon: Info }],
  },
] as const;

const SettingsPage: React.FC = () => {
  const { pathname } = useLocation();

  return (
    <div className="settings-shell flex h-full min-h-0 -m-24px">
      <aside className="settings-aside w-220px shrink-0 border-r border-b-base bg-2 px-10px py-16px flex flex-col gap-16px overflow-y-auto">
        <div className="px-10px text-16px font-600 text-t-primary mb-4px">Settings</div>
        {SECTIONS.map((section) => (
          <div key={section.group}>
            <div className="settings-sider__group-header px-10px text-11px font-500 text-t-tertiary tracking-wide uppercase mb-6px">
              {section.group}
            </div>
            <div className="flex flex-col gap-2px">
              {section.items.map(({ path, label, Icon }) => {
                const to = `/settings/${path}`;
                const active = pathname === to || pathname.endsWith(`/${path}`);
                return (
                  <NavLink
                    key={path}
                    to={to}
                    className={classNames(
                      "settings-sider__item flex items-center gap-10px rd-8px px-12px py-9px no-underline text-13px",
                      active
                        ? "bg-3 text-t-primary font-600"
                        : "text-t-secondary hover:bg-hover"
                    )}
                  >
                    <Icon theme="outline" size="16" fill="currentColor" strokeWidth={3} />
                    <span>{label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      <div className="flex-1 min-w-0 overflow-auto p-28px bg-1">
        <Routes>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<GeneralSettings />} />
          <Route path="appearance" element={<AppearanceSettings />} />
          <Route path="remote" element={<RemoteSettings />} />
          <Route path="download" element={<DownloadSettings />} />
          <Route path="providers" element={<ProvidersSettings />} />
          <Route path="about" element={<AboutSettings />} />
          <Route path="*" element={<Navigate to="general" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default SettingsPage;

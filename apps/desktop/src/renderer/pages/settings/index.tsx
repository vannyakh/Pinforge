import React from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import classNames from "classnames";
import { ApplicationOne, Info, Platte, LinkCloud, Computer, Left } from "@icon-park/react";
import ProvidersSettings from "./Providers";
import ProviderDetailPage from "./ProviderDetail";
import AboutSettings from "./About";
import AppearanceSettings from "./Appearance";
import RemoteSettings from "./Remote";
import SystemSettings from "./System";
import logoUrl from "@renderer/assets/logo.png";

const SECTIONS = [
  {
    group: "Application",
    items: [
      { path: "appearance", label: "Appearance", Icon: Platte },
      { path: "remote", label: "Remote", Icon: LinkCloud },
      { path: "system", label: "System", Icon: Computer },
    ],
  },
  {
    group: "Download",
    items: [{ path: "providers", label: "Providers", Icon: ApplicationOne }],
  },
  {
    group: "Other",
    items: [{ path: "about", label: "About", Icon: Info }],
  },
] as const;

const SettingsPage: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <div className="settings-shell settings-shell--solo flex h-full min-h-0">
      <aside className="settings-aside w-260px shrink-0 border-r border-b-base bg-2 flex flex-col min-h-0">
        <div className="flex items-center gap-12px px-18px py-14px shrink-0">
          <img
            src={logoUrl}
            alt=""
            className="size-28px rd-full object-cover"
            draggable={false}
          />
          <div className="text-15px font-600 text-t-primary">Settings</div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-10px pb-12px flex flex-col gap-16px">
          {SECTIONS.map((section) => (
            <div key={section.group}>
              <div className="settings-sider__group-header px-10px text-11px font-500 text-t-tertiary tracking-wide uppercase mb-6px">
                {section.group}
              </div>
              <div className="flex flex-col gap-2px">
                {section.items.map(({ path, label, Icon }) => {
                  const to = `/settings/${path}`;
                  const active =
                    path === "providers"
                      ? pathname === to || pathname.startsWith(`${to}/`)
                      : pathname === to || pathname.endsWith(`/${path}`);
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
        </div>

        <div className="shrink-0 border-t border-b-base px-10px py-10px">
          <button
            type="button"
            className="w-full flex items-center gap-10px rd-8px border-none cursor-pointer text-left px-12px py-10px bg-transparent text-t-secondary hover:bg-hover"
            onClick={() => navigate("/")}
          >
            <Left theme="outline" size="16" fill="currentColor" strokeWidth={3} />
            <span className="text-13px">Back to Home</span>
          </button>
        </div>
      </aside>

      <div className="settings-pane flex-1 min-w-0 overflow-auto p-28px bg-1">
        <Routes>
          <Route index element={<Navigate to="system" replace />} />
          <Route path="system" element={<SystemSettings />} />
          <Route path="appearance" element={<AppearanceSettings />} />
          <Route path="remote" element={<RemoteSettings />} />
          <Route path="providers" element={<ProvidersSettings />} />
          <Route path="providers/:providerId" element={<ProviderDetailPage />} />
          <Route path="about" element={<AboutSettings />} />
          <Route path="general" element={<Navigate to="../system" replace />} />
          <Route path="download" element={<Navigate to="../system" replace />} />
          <Route path="*" element={<Navigate to="system" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default SettingsPage;

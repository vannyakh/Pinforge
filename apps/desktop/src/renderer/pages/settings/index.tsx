import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProvidersSettings from "./Providers";
import ProviderDetailPage from "./ProviderDetail";
import AboutSettings from "./About";
import AppearanceSettings from "./Appearance";
import RemoteSettings from "./Remote";
import PublishingSettings from "./Publishing";
import SystemSettings from "./System";
import DownloadSettings from "./Download";
import AgentSettings from "./Agent";

const SettingsPage: React.FC = () => {
  return (
    <div className="settings-shell flex h-full min-h-0">
      <div className="settings-pane">
        <div className="settings-pane__inner">
          <Routes>
            <Route index element={<Navigate to="system" replace />} />
            <Route path="system" element={<SystemSettings />} />
            <Route path="appearance" element={<AppearanceSettings />} />
            <Route path="remote" element={<RemoteSettings />} />
            <Route path="publishing" element={<PublishingSettings />} />
            <Route path="download" element={<DownloadSettings />} />
            <Route path="agent" element={<AgentSettings />} />
            <Route path="providers" element={<ProvidersSettings />} />
            <Route path="providers/:providerId" element={<ProviderDetailPage />} />
            <Route path="about" element={<AboutSettings />} />
            <Route path="general" element={<Navigate to="../system" replace />} />
            <Route path="*" element={<Navigate to="system" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

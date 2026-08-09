import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import DownloadPage from "@renderer/pages/download";
import GalleryPage from "@renderer/pages/gallery";
import TasksPage from "@renderer/pages/tasks";
import SchedulePage from "@renderer/pages/schedule";
import SettingsPage from "@renderer/pages/settings";

const Router: React.FC = () => (
  <Routes>
    <Route path="/" element={<DownloadPage />} />
    <Route path="/tasks" element={<TasksPage />} />
    <Route path="/schedule" element={<SchedulePage />} />
    <Route path="/gallery" element={<GalleryPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/settings/*" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default Router;

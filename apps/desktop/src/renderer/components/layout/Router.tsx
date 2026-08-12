import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import DownloadPage from "@renderer/pages/download";
import TasksPage from "@renderer/pages/tasks";
import PostsPage from "@renderer/pages/posts";
import PublishPage from "@renderer/pages/publish";
import SchedulePage from "@renderer/pages/schedule";
import SettingsPage from "@renderer/pages/settings";

const Router: React.FC = () => (
  <Routes>
    <Route path="/" element={<DownloadPage />} />
    <Route path="/tasks" element={<TasksPage />} />
    <Route path="/posts" element={<PostsPage />} />
    <Route path="/publish" element={<PublishPage />} />
    <Route path="/schedule" element={<SchedulePage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/settings/*" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default Router;

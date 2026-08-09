import React from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Sider from "./components/layout/Sider";
import DownloadPage from "./pages/download";
import GalleryPage from "./pages/gallery";
import TasksPage from "./pages/tasks";
import SchedulePage from "./pages/schedule";
import SettingsPage from "./pages/settings";
import { AppProvider } from "./hooks/context/AppContext";
import { ThemeProvider } from "./hooks/context/ThemeContext";
import { NavigationHistoryProvider } from "./hooks/context/NavigationHistoryContext";

const App: React.FC = () => (
  <ThemeProvider>
    <AppProvider>
      <HashRouter>
        <NavigationHistoryProvider>
          <Routes>
            <Route element={<Layout sider={<Sider />} />}>
              <Route path="/" element={<DownloadPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/gallery" element={<GalleryPage />} />
              <Route path="/settings/*" element={<SettingsPage />} />
              <Route path="*" element={<DownloadPage />} />
            </Route>
          </Routes>
        </NavigationHistoryProvider>
      </HashRouter>
    </AppProvider>
  </ThemeProvider>
);

export default App;

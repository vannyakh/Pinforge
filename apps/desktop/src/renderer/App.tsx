import React, { useCallback, useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Sider from "./components/layout/Sider";
import EnvironmentSetup from "./components/setup/EnvironmentSetup";
import DownloadPage from "./pages/download";
import TasksPage from "./pages/tasks";
import SchedulePage from "./pages/schedule";
import SettingsPage from "./pages/settings";
import { AppProvider, useApp } from "./hooks/context/AppContext";
import { ThemeProvider } from "./hooks/context/ThemeContext";
import { NavigationHistoryProvider } from "./hooks/context/NavigationHistoryContext";
import logoUrl from "@renderer/assets/logo.png";

const AppRoutes: React.FC = () => (
  <HashRouter>
    <NavigationHistoryProvider>
      <Routes>
        <Route element={<Layout sider={<Sider />} />}>
          <Route path="/" element={<DownloadPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="*" element={<DownloadPage />} />
        </Route>
      </Routes>
    </NavigationHistoryProvider>
  </HashRouter>
);

const AppShell: React.FC = () => {
  const { settings, refresh } = useApp();
  const [gate, setGate] = useState<"loading" | "setup" | "ready">("loading");

  // Resolve boot gate from settings (avoids hanging on a separate IPC).
  useEffect(() => {
    if (!settings) return;
    setGate(settings.system?.environmentSetupDone === false ? "setup" : "ready");
  }, [settings]);

  // Transparent rounded chrome for splash + onboarding only.
  useEffect(() => {
    const rounded = gate === "loading" || gate === "setup";
    document.documentElement.classList.toggle("splash-shell", gate === "loading");
    document.documentElement.classList.toggle("installer-shell", gate === "setup");
    document.body.classList.toggle("splash-shell", gate === "loading");
    document.body.classList.toggle("installer-shell", gate === "setup");
    if (!rounded) {
      document.documentElement.classList.remove("splash-shell", "installer-shell");
      document.body.classList.remove("splash-shell", "installer-shell");
    }
    return () => {
      document.documentElement.classList.remove("splash-shell", "installer-shell");
      document.body.classList.remove("splash-shell", "installer-shell");
    };
  }, [gate]);

  const onSetupFinished = useCallback(() => {
    void refresh().finally(() => setGate("ready"));
  }, [refresh]);

  if (gate === "loading") {
    return (
      <div className="app-boot" data-theme="dark">
        <img className="app-boot__logo" src={logoUrl} alt="Pinforge" draggable={false} />
        <div className="app-boot__name">Pinforge</div>
        <div className="app-boot__label">Loading…</div>
      </div>
    );
  }

  if (gate === "setup") {
    return <EnvironmentSetup onFinished={onSetupFinished} />;
  }

  return <AppRoutes />;
};

const App: React.FC = () => (
  <ThemeProvider>
    <AppProvider>
      <AppShell />
    </AppProvider>
  </ThemeProvider>
);

export default App;

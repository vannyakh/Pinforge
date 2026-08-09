import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "@arco-design/web-react";
import enUS from "@arco-design/web-react/es/locale/en-US";
import "@arco-design/web-react/dist/css/arco.css";
import "virtual:uno.css";
import "./styles/themes/index.css";
import "./styles/arco-override.css";
import "./styles/layout.css";
import App from "./App";

// Inline overflow so Arco Modal/Drawer skip scroll-lock width shrink.
// With html { zoom }, window.innerWidth − clientWidth is often non-zero even
// when there is no scrollbar, which left a gap beside the window controls.
document.body.style.overflow = "hidden";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ConfigProvider locale={enUS}>
        <App />
      </ConfigProvider>
    </React.StrictMode>
  );
}

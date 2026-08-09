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

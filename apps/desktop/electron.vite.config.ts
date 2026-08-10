import { resolve } from "path";
import { readFileSync } from "fs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import UnoCSS from "unocss/vite";
import unoConfig from "./uno.config";

const desktopSrc = resolve("src");
const rendererRoot = resolve("src/renderer");
const APP_VERSION = JSON.parse(readFileSync(resolve("package.json"), "utf-8")).version as string;

/** Heavy / Node-native deps must stay external — bundling undici pulls `node:sqlite` (unsupported in Electron 31). */
const MAIN_EXTERNALS = [
  "sharp",
  "playwright",
  "playwright-core",
  "chromium-bidi",
  "@distube/ytdl-core",
  "youtubei.js",
  "undici",
  "node:sqlite",
];

/** Bundle these into main so pnpm nested deps (e.g. conf) are not required at runtime. */
const MAIN_BUNDLE_DEPS = ["@pinterest-desktop/core", "electron-store", "electron-updater"];

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: MAIN_BUNDLE_DEPS,
      }),
    ],
    resolve: {
      alias: {
        "@": desktopSrc,
        "@common": resolve("src/common"),
        "@process": resolve("src/process"),
        "@renderer": rendererRoot,
        "@pinterest-desktop/core": resolve("../../packages/core/src/index.ts"),
      },
      extensions: [".ts", ".tsx", ".js", ".json"],
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/index.ts"),
        },
        external: MAIN_EXTERNALS,
        output: {
          // Avoid chunks that `require` the main entry (re-executes side-effectful deps).
          inlineDynamicImports: true,
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@": desktopSrc,
        "@common": resolve("src/common"),
      },
      extensions: [".ts", ".tsx", ".js", ".json"],
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    root: rendererRoot,
    base: "./",
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    resolve: {
      alias: {
        "@": desktopSrc,
        "@common": resolve("src/common"),
        "@renderer": rendererRoot,
        "@resources": resolve("resources"),
      },
      extensions: [".ts", ".tsx", ".js", ".jsx", ".css"],
      dedupe: ["react", "react-dom", "react-router-dom"],
    },
    plugins: [react(), UnoCSS(unoConfig)],
    build: {
      target: "es2022",
      rollupOptions: {
        input: {
          index: resolve(rendererRoot, "index.html"),
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom", "@arco-design/web-react", "@icon-park/react", "classnames"],
      exclude: ["playwright", "playwright-core", "chromium-bidi"],
    },
  },
});

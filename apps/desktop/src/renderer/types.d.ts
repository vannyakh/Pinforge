import type { DesktopApi } from "../preload/index";

declare global {
  interface Window {
    api: DesktopApi;
  }
}

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

export {};

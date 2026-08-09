/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.css?raw" {
  const css: string;
  export default css;
}

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

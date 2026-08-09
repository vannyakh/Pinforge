/**
 * Helpers for injecting user-selected background images into theme CSS.
 */
export const BACKGROUND_BLOCK_START = "/* AionUi Theme Background Start */";
export const BACKGROUND_BLOCK_END = "/* AionUi Theme Background End */";

const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BACKGROUND_BLOCK_PATTERN = new RegExp(
  `${escapeRegex(BACKGROUND_BLOCK_START)}[\\s\\S]*?${escapeRegex(BACKGROUND_BLOCK_END)}\n?`,
  "g"
);

const buildBackgroundCss = (imageDataUrl: string): string => {
  if (!imageDataUrl) return "";
  return `${BACKGROUND_BLOCK_START}
body,
html,
.arco-layout,
.app-shell {
  background-image: url("${imageDataUrl}");
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center center;
  background-attachment: fixed;
  background-color: transparent;
}

.layout-content,
.layout-content.bg-1,
.arco-layout-content,
.bg-1,
.bg-2:not(.app-titlebar) {
  background-color: transparent;
  background-image: none;
}
${BACKGROUND_BLOCK_END}`;
};

/**
 * Inject (or replace) the standard background CSS block using the provided image.
 */
export const injectBackgroundCssBlock = (css: string, imageDataUrl: string): string => {
  if (!css) {
    return buildBackgroundCss(imageDataUrl);
  }
  BACKGROUND_BLOCK_PATTERN.lastIndex = 0;
  const cleanedCss = css.replace(BACKGROUND_BLOCK_PATTERN, "").trim();
  const block = buildBackgroundCss(imageDataUrl);
  return [cleanedCss, block].filter(Boolean).join("\n\n");
};

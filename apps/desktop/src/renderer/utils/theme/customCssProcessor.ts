/**
 * Lightweight custom CSS processor (AionUi-compatible wrap, no PostCSS dep).
 * Appends a marker comment so decorative CSS is identifiable in DevTools.
 */
export const processCustomCss = (css: string): string => {
  if (!css || !css.trim()) return "";
  return `
/* User Custom Styles */
${css.trim()}
  `.trim();
};

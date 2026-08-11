/**
 * Cross-site browser scrape helpers (Playwright meta / HTML fallback).
 */

export {
  scrapePageMeta,
  fetchHtmlOrPlaywrightMeta,
  closePlaywrightBrowser,
} from "./playwrightMeta";
export type { PageMeta, ScrapeMetaOptions } from "./playwrightMeta";

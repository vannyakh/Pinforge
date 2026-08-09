import "./pinterest";
import "./extractorProviders";
import "./stubs";

export { registerProvider, listProviders, getProvider, detectProvider } from "./registry";
export type { MediaProvider, ResolveContext } from "./types";
export { ProviderNotImplementedError, ProviderNotFoundError } from "./types";
export { resolvePin, resolveBoard, isBoardUrl, isPinUrl, isPinterestUrl } from "./pinterest";
export { extractYouTubeViaPiped as extractYouTube } from "./extractors/youtube";
export { extractInstagram } from "./extractors/instagram";
export { extractTikTok } from "./extractors/tiktok";
export {
  scrapePageMeta,
  fetchHtmlOrPlaywrightMeta,
  closePlaywrightBrowser,
} from "./extractors/playwrightMeta";
export type { PageMeta, ScrapeMetaOptions } from "./extractors/playwrightMeta";

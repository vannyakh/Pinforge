const BLOCKED_CAROUSEL_HOSTS = new Set([
  "facebook.com",
  "fb.com",
  "fb.me",
  "fb.watch",
  "instagram.com",
]);

function blockedCarouselHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  if (BLOCKED_CAROUSEL_HOSTS.has(host)) return true;
  return host.endsWith(".facebook.com") || host.endsWith(".fb.com");
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractUrlsFromText(text: string): string[] {
  return [...text.matchAll(URL_IN_TEXT_RE)].map((match) => match[0]!);
}

export function isBlockedCarouselUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    return blockedCarouselHost(new URL(candidate).hostname);
  } catch {
    return false;
  }
}

export function findBlockedCarouselUrlsInText(text: string): string[] {
  return extractUrlsFromText(text).filter(isBlockedCarouselUrl);
}

export function carouselCaptionLinkIssue(message: string, hashtags = ""): string | null {
  const blocked = findBlockedCarouselUrlsInText(`${message}\n${hashtags}`);
  if (blocked.length === 0) return null;
  const sample = blocked.slice(0, 2).join(", ");
  const suffix = blocked.length > 2 ? "…" : "";
  return `Remove Facebook or Instagram links from your caption (${sample}${suffix}). Carousel posts cannot include those URLs in the post text.`;
}

/** Normalize and validate an external landing URL for Meta carousel link posts. */
export function normalizeCarouselLandingLink(raw?: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (blockedCarouselHost(url.hostname)) return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const CAROUSEL_LANDING_LINK_REQUIRED_MESSAGE =
  "Enter an external landing link (https://…) in CTA option. Facebook and Instagram URLs are not eligible for carousel cards.";

export const CAROUSEL_LANDING_LINK_INELIGIBLE_MESSAGE =
  "That landing link is not eligible for carousel posts. Use a public external website URL (not facebook.com or instagram.com).";

/** User-facing reason when carousel landing link blocks publish readiness. Empty is allowed. */
export function carouselLandingLinkIssue(raw?: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (!normalizeCarouselLandingLink(raw)) return CAROUSEL_LANDING_LINK_INELIGIBLE_MESSAGE;
  return null;
}

export function defaultCarouselPageLink(pageId: string): string {
  const id = pageId.trim();
  return id ? `https://www.facebook.com/${id}` : "https://www.facebook.com/";
}

/** Landing link for publish: custom external URL, or Page URL when the field is left empty. */
export function resolveCarouselLandingLink(pageId: string, raw?: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return defaultCarouselPageLink(pageId);
  return normalizeCarouselLandingLink(raw);
}

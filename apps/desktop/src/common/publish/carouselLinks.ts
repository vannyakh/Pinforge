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

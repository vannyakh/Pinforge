import type { ResolvedProviderHit } from "@pinforge/api/providers";
import type { UrlIntent, UrlIntentKind } from "../types";

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractUrls(text: string): string[] {
  const hits = text.match(URL_RE) ?? [];
  return [...new Set(hits.map((u) => u.replace(/[.,;:!?)]+$/, "")))];
}

export type ProviderResolver = (url: string) => ResolvedProviderHit | null;

function modeFromProvider(providerId: string, url: string): UrlIntentKind {
  try {
    const u = new URL(url.trim());
    const path = u.pathname.toLowerCase();
    if (providerId === "pinterest") {
      if (path.includes("/search/")) return "search";
      const parts = path.split("/").filter(Boolean);
      if (parts.length === 1) return "profile";
      if (parts.some((p) => p.startsWith("section"))) return "board";
      if (parts.length >= 2 && !path.includes("/pin/")) return "board";
      return "single";
    }
    if (providerId === "youtube") {
      if (path.includes("/playlist")) return "playlist";
      if (u.searchParams.has("list") && !u.searchParams.has("v")) return "playlist";
      if (/^\/(channel|c|user)\//.test(path) || /^\/@[^/]+/.test(path)) return "channel";
      return "single";
    }
    if (providerId === "tiktok") {
      if (/^\/@[^/]+\/?$/.test(path)) return "profile";
      return "single";
    }
    if (providerId === "instagram") {
      if (/^\/[^/]+\/?$/.test(path) && !path.includes("/p/") && !path.includes("/reel/")) {
        return "profile";
      }
      return "single";
    }
  } catch {
    /* ignore */
  }
  return "single";
}

function suggestedAction(kind: UrlIntentKind): UrlIntent["suggestedAction"] {
  switch (kind) {
    case "board":
    case "profile":
    case "playlist":
    case "channel":
    case "search":
      return "extract";
    case "single":
      return "download";
    default:
      return "detect";
  }
}

/** Route a media URL to provider + download intent (deterministic, no LLM). */
export function classifyUrlIntent(url: string, resolve: ProviderResolver): UrlIntent {
  const trimmed = url.trim();
  if (!trimmed) {
    return {
      kind: "unknown",
      url: trimmed,
      suggestedAction: "none",
      confidence: "low",
      reason: "Empty URL",
    };
  }

  const provider = resolve(trimmed);
  if (!provider) {
    return {
      kind: "unknown",
      url: trimmed,
      suggestedAction: "none",
      confidence: "low",
      reason: "No matching provider for this URL",
    };
  }

  const kind = modeFromProvider(provider.id, trimmed);
  return {
    kind,
    url: trimmed,
    providerId: provider.id,
    providerLabel: provider.label,
    suggestedAction: suggestedAction(kind),
    confidence: "high",
  };
}

export function classifyTextIntents(text: string, resolve: ProviderResolver): UrlIntent[] {
  return extractUrls(text).map((url) => classifyUrlIntent(url, resolve));
}

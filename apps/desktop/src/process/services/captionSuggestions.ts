import { getStore } from "../store";

function normalizeTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of titles) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function getCaptionTitleSuggestions(): string[] {
  const list = getStore().get("publish").captionTitleSuggestions;
  return Array.isArray(list) ? normalizeTitles(list) : [];
}

export function setCaptionTitleSuggestions(titles: string[]): string[] {
  const store = getStore();
  const publish = store.get("publish");
  const next = normalizeTitles(titles);
  store.set("publish", { ...publish, captionTitleSuggestions: next });
  return next;
}

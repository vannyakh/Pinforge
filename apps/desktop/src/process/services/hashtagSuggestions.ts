import { getStore } from "../store";

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function getHashtagSuggestions(): string[] {
  const list = getStore().get("publish").hashtagSuggestions;
  return Array.isArray(list) ? normalizeTags(list) : [];
}

export function setHashtagSuggestions(tags: string[]): string[] {
  const store = getStore();
  const publish = store.get("publish");
  const next = normalizeTags(tags);
  store.set("publish", { ...publish, hashtagSuggestions: next });
  return next;
}

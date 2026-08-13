/** Merge caption body and trailing hashtag block for Meta post message. */
export function buildPublishMessage(message: string, hashtags: string): string {
  const caption = message.trim();
  const tags = hashtags.trim();
  if (!caption) return tags;
  if (!tags) return caption;
  return `${caption}\n\n${tags}`;
}

/** Normalize hashtag tokens for storage (ensure leading #). */
export function normalizeHashtagToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed.replace(/^#+/, "")}`;
}

/** Parse a hashtag line into individual tags. */
export function parseHashtagLine(line: string): string[] {
  return line
    .split(/[\s,]+/)
    .map((part) => normalizeHashtagToken(part))
    .filter(Boolean);
}

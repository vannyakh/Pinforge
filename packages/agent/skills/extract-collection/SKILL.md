---
id: extract-collection
label: Extract collection
taskIntent: extract_collection
tools: detect_url, extract_preview
keywords: list, preview, extract, board, playlist, channel, how many
urlKinds: board, profile, playlist, channel, search
urlActions: extract
priority: 20
autoExecute: true
---

# Extract collection

Use for **boards, profiles, playlists, channels, or search** — anything with many items.

## Intent signals

- Pinterest board/profile, YouTube playlist/channel, TikTok profile
- User asks to list, preview, or count items before downloading

## Steps

1. `detect_url`
2. `extract_preview` — list items and count

## Reply

Summarize title, item count, and provider. Ask before bulk download unless user said "download all".

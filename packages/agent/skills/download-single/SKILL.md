---
id: download-single
label: Download single item
taskIntent: download_url
tools: detect_url, start_download
keywords: download, save, grab
urlKinds: single
urlActions: download
priority: 10
autoExecute: true
---

# Download single item

Use when the user wants to **download one video, pin, reel, or post**.

## Intent signals

- Single-item URL (YouTube watch, Pinterest pin, TikTok video, Instagram reel)
- User says: download, save, grab this video/pin

## Steps

1. `detect_url` — confirm provider
2. `start_download` — start with current Settings defaults

## Reply

Confirm provider and that the download started. Keep it brief.

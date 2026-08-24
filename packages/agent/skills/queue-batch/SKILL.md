---
id: queue-batch
label: Queue downloads
taskIntent: queue_urls
tools: detect_url, queue_download
keywords: queue, for later, add to tasks, batch
priority: 30
autoExecute: true
---

# Queue batch

Add URLs to the **Tasks queue** without starting immediately.

## Intent signals

- User says: queue, add to tasks, for later, batch

## Steps

1. `detect_url` for each URL (optional if already known)
2. `queue_download` with all URLs in one call

## Reply

Confirm how many URLs were queued.

---
id: analyze-url
label: Analyze URL
taskIntent: analyze_url
tools: detect_url, extract_preview
keywords: analyze, detect, what is this, which provider
urlActions: detect
priority: 50
autoExecute: true
---

# Analyze URL

Identify provider and media type **without downloading**.

## Intent signals

- User asks to analyze, detect, or identify a URL
- Unknown or unsupported-looking link

## Steps

1. `detect_url`
2. For collections, also `extract_preview`

## Reply

Provider name, media kind (single vs collection), and item count if applicable.

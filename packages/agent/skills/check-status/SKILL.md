---
id: check-status
label: Check status
taskIntent: check_status
tools: get_status
keywords: status, queue status, queue count, out dir, ffmpeg, yt-dlp, ready
priority: 40
autoExecute: true
---

# Check status

Report download folder, queue, running packs, and tool readiness.

## Intent signals

- User asks about status, queue, output folder, ffmpeg, or yt-dlp

## Steps

1. `get_status`

## Reply

Include outDir, queue count, running packs, and whether ffmpeg/ytdlp are available.

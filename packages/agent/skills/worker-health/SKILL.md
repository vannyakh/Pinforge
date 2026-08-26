---
id: worker-health
label: Rust server health
taskIntent: worker_health
tools: worker_ping
keywords: rust, server, native, pinforge-server, pinforge-worker
priority: 60
autoExecute: true
---

# Server health

Check **pinforge-server** (Rust) for native enhance/download/jobs. One-shot
`pinforge-worker` remains a fallback only when the server is not running.

## Steps

1. `worker_ping`

## Reply

Report whether the server binary is found, whether the live process is running, and ping status.

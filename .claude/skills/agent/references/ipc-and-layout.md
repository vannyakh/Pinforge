# Agent IPC & File Map

## File index

| Path | Role |
| --- | --- |
| `packages/agent/src/index.ts` | Public exports |
| `packages/agent/src/orchestrator.ts` | `runAgentTurn`, `analyzeUrlWithAgent` |
| `packages/agent/src/router/urlIntent.ts` | `classifyUrlIntent`, `extractUrls` |
| `packages/agent/src/providers/registry.ts` | Failover, `chatWithFailover` |
| `packages/agent/src/providers/openaiCompatible.ts` | OpenAI / Ollama / OpenClaw |
| `packages/agent/src/providers/anthropic.ts` | Anthropic messages API |
| `packages/agent/src/tools/catalog.ts` | `AGENT_TOOLS`, system prompt |
| `packages/agent/src/tools/parseToolCalls.ts` | Parse ` ```tool ` blocks |
| `packages/core/src/agent.ts` | Re-export `@pinforge/agent` |
| `apps/desktop/src/process/services/agent/AgentService.ts` | Session store, chat entry |
| `apps/desktop/src/process/services/agent/toolRuntime.ts` | Tool execution |
| `apps/desktop/src/process/bridge/agentBridge.ts` | IPC registration |
| `apps/desktop/src/common/agent/types.ts` | Shared type re-exports |
| `apps/desktop/src/renderer/pages/settings/Agent.tsx` | Settings UI |
| `apps/desktop/src/preload/index.ts` | `getAgentConfig`, `agentChat`, … |
| `apps/desktop/src/renderer/api/index.ts` | Renderer API wrapper |

## Preload / renderer API

```typescript
api.getAgentConfig()
api.setAgentConfig(partial)
api.listAgentProviders()
api.agentChat({ sessionId?, message, providerId? })
api.agentAnalyzeUrl(url)
api.agentCancel()
```

## Store schema

`AppStoreSchema.agent: AgentConfig` — defaults from `DEFAULT_AGENT_CONFIG`.

Also exposed via `settings:get` / `settings:set` with `agent` partial.

## Remote / bot parity

`remoteTools.ts` exposes REST tools for Telegram bots. Agent tools should call the same underlying helpers:

- `detectRemoteUrl` ↔ `detect_url`
- `queueRemoteUrls` ↔ `queue_download`
- `downloadRemoteUrl` ↔ `start_download`
- `getRemoteToolStatus` ↔ `get_status`

When adding bot-facing features, extend `toolRuntime.ts` first, then mirror in `remoteTools.ts` if needed.

## Rust worker

`worker_ping` tool → `resolveWorkerBinary()` + `rustPing()` from `@pinforge/worker`.

Native enhance/download already route through Rust in `@pinforge/enhance` and `@pinforge/download` — agent does not spawn worker directly except for health checks.

## Orchestrator flow

```
User message
  → classifyTextIntents (if autoAnalyzeUrls)
  → auto-run tools (detect/extract/download per intent)
  → LLM chat with system prompt + tool results context
  → parse LLM ```tool``` blocks → execute additional tools
  → summarize reply
```

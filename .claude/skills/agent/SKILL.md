---
name: agent
description: |
  Pinforge multi-LLM agent service — chat, URL intent routing, tool automation, IPC, and Rust worker integration.
  Use when: (1) Adding or modifying agent/LLM features, (2) Wiring chat UI to agent APIs,
  (3) Adding agent tools or providers (OpenAI, Anthropic, Ollama, OpenClaw),
  (4) URL intent → download automation, (5) Integrating bots/remote API with agent runtime.
---

# Agent Skill

Guide for Pinforge's built-in agent layer: multi-LLM chat, deterministic URL routing, and download task automation.

**Announce at start:** "I'm using the agent skill for LLM/agent work."

## Trigger Conditions

- Adding or changing `@pinforge/agent` logic
- New LLM provider adapter or tool definition
- IPC channels under `agent:*`
- Wiring download chat / Telegram / OpenClaw to agent
- URL intent routing or auto-analyze behavior
- Rust worker checks from agent tools

## Architecture

```
packages/agent/
├── skills/                             # Runtime skills — one folder per skill
│   ├── download-single/SKILL.md
│   ├── extract-collection/SKILL.md
│   ├── queue-batch/SKILL.md
│   └── …
├── src/skills/
│   ├── loadSkillMd.ts                  # Parse SKILL.md frontmatter + body
│   ├── registry.ts                     # listAgentSkills, registerAgentSkill
│   └── classifyTask.ts                 # classifyAgentTask → skill + tool plan
```
├── src/types.ts                        # AgentConfig, UrlIntent, messages
├── src/router/urlIntent.ts             # URL → provider + suggested action
├── src/providers/                      # OpenAI-compatible, Anthropic, failover
├── src/tools/catalog.ts                # Tool defs + system prompt
├── src/orchestrator.ts                 # runAgentTurn, analyzeUrlWithAgent

apps/desktop/src/process/
├── services/agent/AgentService.ts      # Sessions, chat, config
├── services/agent/toolRuntime.ts       # Executes tools → core/remote/rust
└── bridge/agentBridge.ts               # ipcMain.handle("agent:…")

apps/desktop/src/renderer/
└── pages/settings/Agent.tsx            # Settings → Application → Agent
```

Import paths:

| Use | Import |
| --- | --- |
| Core logic (CLI, tests) | `@pinforge/agent` |
| Skill registry | `@pinforge/agent/skills` |
| Façade | `@pinforge/core/agent` |
| Renderer IPC | `@renderer/api` → `api.agentChat`, `api.agentAnalyzeUrl` |

## Process Boundaries

| Layer | Allowed |
| --- | --- |
| `packages/agent` | Pure TS, fetch to LLM APIs, no Electron |
| `toolRuntime.ts` | Main process only — calls MediaCore, store, rust worker |
| Renderer | IPC via `window.api` — never import `@pinforge/agent` orchestrator directly for tool execution |

LLM API keys live in electron-store (`agent.providers[].apiKey`) — main process only.

## URL Intent Routing

Deterministic routing runs **before** LLM (when `autoAnalyzeUrls` is on):

| Intent kind | Typical URL | Suggested action |
| --- | --- | --- |
| `single` | YouTube watch, Pinterest pin | `download` |
| `board` / `profile` / `search` | Pinterest board/profile | `extract` |
| `playlist` / `channel` | YouTube playlist/channel | `extract` |
| `unknown` | Unmatched host | `none` |

```typescript
import { classifyUrlIntent } from "@pinforge/agent";

const intent = classifyUrlIntent(url, resolveProviderForUrl);
// intent.suggestedAction → "extract" | "download" | "detect" | "none"
```

## Built-in Skills (runtime registry)

Each skill is a folder under `packages/agent/skills/<id>/SKILL.md`:

- YAML frontmatter: `id`, `taskIntent`, `tools`, `keywords`, `urlKinds`, `urlActions`, `priority`
- Markdown body: prompt the AI reads when that skill is active

| Skill id | Task intent | When matched |
| --- | --- | --- |
| `download-single` | `download_url` | Single pin/video URL |
| `extract-collection` | `extract_collection` | Board, profile, playlist, channel |
| `queue-batch` | `queue_urls` | "queue this", "for later" |
| `check-status` | `check_status` | "status", ffmpeg/ytdlp readiness |
| `analyze-url` | `analyze_url` | "analyze", "detect" |
| `worker-health` | `worker_health` | Rust worker ping |
| `general-chat` | `chat` | Fallback |

```typescript
import { classifyAgentTask, listAgentSkills } from "@pinforge/agent/skills";

const task = classifyAgentTask({
  message: userText,
  urlIntents: classifyTextIntents(userText, resolveProvider),
});
// task.skillId, task.taskIntent, task.toolPlan, task.systemPrompt
```

Flow: **URL router** → **skill classifier** (keywords + URL signals from SKILL.md) → **tool plan** → **LLM prompt** (skill markdown body).

## Adding a New Skill

1. Create `packages/agent/skills/<id>/SKILL.md` with frontmatter + prompt body
2. Call `reloadAgentSkills()` if hot-reloading at runtime
3. No TypeScript changes required unless new tools are needed

## Built-in Tools

Defined in `packages/agent/src/tools/catalog.ts`, executed in `toolRuntime.ts`:

| Tool | Purpose |
| --- | --- |
| `detect_url` | Provider match |
| `extract_preview` | Board/playlist item list (`extractMediaPreview`) |
| `queue_download` | Add to Tasks queue |
| `start_download` | Start download (`downloadRemoteUrl`) |
| `get_status` | Queue, outDir, ffmpeg/ytdlp readiness |
| `worker_ping` | Rust `pinforge-worker` health |

LLM tool syntax (in assistant reply):

````markdown
```tool
{"name":"detect_url","arguments":{"url":"https://..."}}
```
````

## LLM Providers

Default providers in `DEFAULT_AGENT_PROVIDERS` (`packages/agent/src/types.ts`):

| id | kind | Notes |
| --- | --- | --- |
| `ollama-local` | `ollama` | OpenAI-compatible, no API key |
| `openai` | `openai` | OpenAI-compatible API |
| `anthropic` | `anthropic` | Messages API |
| `openclaw` | `openclaw` | OpenAI-compatible (bot gateway) |

Failover: enabled providers sorted by `priority` (lower first). Use `chatWithFailover` from `@pinforge/agent`.

## IPC Surface

Registered in `agentBridge.ts`:

```
agent:getConfig          agent:setConfig
agent:listProviders      agent:chat
agent:analyzeUrl         agent:cancel
agent:sessions:list      agent:sessions:get
agent:sessions:clear
```

Renderer example:

```typescript
const result = await api.agentChat({
  message: "Download https://www.pinterest.com/user/board/",
});
// result.intents, result.toolResults, result.reply
```

## Adding a New Tool

1. Add definition to `AGENT_TOOLS` in `packages/agent/src/tools/catalog.ts`
2. Implement case in `apps/desktop/src/process/services/agent/toolRuntime.ts`
3. Prefer reusing existing services (`remoteTools`, `extractMediaPreview`, `downloadRemoteUrl`, `rustPing`)
4. Add unit test if logic is non-trivial; smoke via `agent:analyzeUrl` for integration paths
5. Update system prompt is automatic via `buildAgentSystemPrompt()`

## Adding a New LLM Provider

1. Add `LlmProviderKind` in `packages/agent/src/types.ts`
2. Implement adapter in `packages/agent/src/providers/` (or map to `chatOpenAiCompatible`)
3. Register in `ADAPTERS` in `providers/registry.ts`
4. Add default entry to `DEFAULT_AGENT_PROVIDERS`
5. Expose in Settings → Agent UI (`Agent.tsx`)

## Config (`AgentConfig`)

Stored at `store.agent`:

- `enabled` — master switch
- `defaultProviderId` — primary model
- `providers[]` — per-provider baseUrl, apiKey, model, priority, enabled
- `autoAnalyzeUrls` — run intent + tools on pasted URLs before LLM
- `autoExecuteTasks` — reserved for auto queue/download from agent recommendations

## Testing

```bash
pnpm --filter @pinforge/agent test
pnpm --filter @pinforge/agent typecheck
```

Tests live in `packages/agent/tests/unit/`. Test URL intent and tool parsing without live LLM calls.

## Checklist (agent changes)

- [ ] Logic in `packages/agent` stays Electron-free
- [ ] Secrets/API keys never exposed to renderer
- [ ] New tools wired in `toolRuntime.ts`
- [ ] IPC + preload + `@renderer/api` updated if new channels
- [ ] Settings UI updated if new provider knobs
- [ ] Unit tests for router/tools; typecheck passes

## Additional Resources

- IPC channels and file map: [references/ipc-and-layout.md](references/ipc-and-layout.md)
- Process boundaries (bridges/services): [../architecture/references/process.md](../architecture/references/process.md)

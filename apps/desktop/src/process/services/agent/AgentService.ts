import {
  analyzeUrlWithAgent,
  DEFAULT_AGENT_CONFIG,
  listEnabledProviders,
  maskProviderForUi,
  runAgentTurn,
  type AgentAnalyzeUrlResponse,
  type AgentChatResponse,
  type AgentConfig,
  type AgentMessage,
  type AgentSession,
} from "@pinforge/agent";
import { getStore } from "../../store";
import { createProviderResolver, executeAgentTool } from "./toolRuntime";

const sessions = new Map<string, AgentSession>();
let abortController: AbortController | null = null;

function mergeAgentConfig(partial?: Partial<AgentConfig>): AgentConfig {
  const store = getStore();
  const saved = store.get("agent") ?? DEFAULT_AGENT_CONFIG;
  return {
    ...DEFAULT_AGENT_CONFIG,
    ...saved,
    ...partial,
    providers: partial?.providers ?? saved.providers ?? DEFAULT_AGENT_CONFIG.providers,
  };
}

function sessionId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getAgentConfig(): AgentConfig {
  return mergeAgentConfig();
}

export function setAgentConfig(partial: Partial<AgentConfig>): AgentConfig {
  const store = getStore();
  const next = mergeAgentConfig(partial);
  store.set("agent", next);
  return next;
}

export function listAgentProvidersForUi() {
  const config = getAgentConfig();
  return listEnabledProviders(config.providers).map(maskProviderForUi);
}

export function listAgentSessions(): AgentSession[] {
  return [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getAgentSession(id: string): AgentSession | null {
  return sessions.get(id) ?? null;
}

export function clearAgentSession(id: string): void {
  sessions.delete(id);
}

export function cancelAgentRequest(): void {
  abortController?.abort();
  abortController = null;
}

export async function agentChat(payload: {
  sessionId?: string;
  message: string;
  providerId?: string;
}): Promise<AgentChatResponse> {
  cancelAgentRequest();
  abortController = new AbortController();
  const config = getAgentConfig();
  if (!config.enabled) {
    throw new Error("Agent is disabled. Enable it in Settings → Agent.");
  }

  const sid = payload.sessionId ?? sessionId();
  const existing = sessions.get(sid);
  const history = existing?.messages ?? [];

  const turn = await runAgentTurn({
    config,
    message: payload.message,
    history,
    providerId: payload.providerId,
    resolveProvider: createProviderResolver(),
    executeTool: (call) => executeAgentTool(call),
    signal: abortController.signal,
  });

  const now = Date.now();
  const session: AgentSession = {
    id: sid,
    title: existing?.title ?? (payload.message.slice(0, 48) || "Agent chat"),
    messages: turn.messages,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  sessions.set(sid, session);
  abortController = null;

  return {
    sessionId: sid,
    reply: turn.reply,
    providerId: turn.providerId,
    model: turn.model,
    intents: turn.intents,
    toolResults: turn.toolResults,
    skillId: turn.task.skillId,
    taskIntent: turn.task.taskIntent,
  };
}

export async function agentAnalyzeUrl(url: string): Promise<AgentAnalyzeUrlResponse> {
  const config = getAgentConfig();
  const result = await analyzeUrlWithAgent({
    url,
    config,
    resolveProvider: createProviderResolver(),
    executeTool: (call) => executeAgentTool(call),
  });
  return {
    intent: result.intent,
    summary: result.summary,
    providerId: result.intent.providerId,
  };
}

export function exportAgentSessions(): AgentMessage[] {
  return listAgentSessions().flatMap((s) => s.messages);
}

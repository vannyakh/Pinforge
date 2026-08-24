import type { AgentLlmProviderConfig, LlmChatRequest, LlmChatResponse } from "../types";
import { parseToolCallsFromText } from "../tools/parseToolCalls";
import { chatAnthropic } from "./anthropic";
import { chatOpenAiCompatible } from "./openaiCompatible";

export type LlmAdapter = (req: LlmChatRequest) => Promise<LlmChatResponse>;

const ADAPTERS: Record<string, LlmAdapter> = {
  openai: chatOpenAiCompatible,
  ollama: chatOpenAiCompatible,
  openclaw: chatOpenAiCompatible,
  anthropic: chatAnthropic,
};

export function listEnabledProviders(config: AgentLlmProviderConfig[]): AgentLlmProviderConfig[] {
  return [...config].filter((p) => p.enabled).sort((a, b) => a.priority - b.priority);
}

export function resolveProvider(
  providers: AgentLlmProviderConfig[],
  preferredId?: string
): AgentLlmProviderConfig | null {
  const enabled = listEnabledProviders(providers);
  if (preferredId) {
    const hit = enabled.find((p) => p.id === preferredId);
    if (hit) return hit;
  }
  return enabled[0] ?? null;
}

export async function chatWithFailover(
  providers: AgentLlmProviderConfig[],
  req: Omit<LlmChatRequest, "provider"> & { providerId?: string },
  opts?: { onProviderError?: (providerId: string, error: unknown) => void }
): Promise<LlmChatResponse> {
  const chain = listEnabledProviders(providers);
  const ordered = req.providerId
    ? [chain.find((p) => p.id === req.providerId), ...chain.filter((p) => p.id !== req.providerId)]
    : chain;
  const candidates = ordered.filter(Boolean) as AgentLlmProviderConfig[];

  if (candidates.length === 0) {
    throw new Error("No LLM providers enabled. Configure one in Settings → Agent.");
  }

  let lastError: unknown;
  for (const provider of candidates) {
    const adapter = ADAPTERS[provider.kind] ?? chatOpenAiCompatible;
    try {
      const response = await adapter({ ...req, provider });
      return {
        ...response,
        toolCalls: response.toolCalls.length
          ? response.toolCalls
          : parseToolCallsFromText(response.content),
      };
    } catch (err) {
      lastError = err;
      opts?.onProviderError?.(provider.id, err);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function providerRequiresApiKey(kind: AgentLlmProviderConfig["kind"]): boolean {
  return kind === "openai" || kind === "anthropic" || kind === "openclaw";
}

export function maskProviderForUi(provider: AgentLlmProviderConfig): AgentLlmProviderConfig {
  return {
    ...provider,
    apiKey: provider.apiKey ? "••••••••" : "",
  };
}

import type { LlmChatRequest, LlmChatResponse } from "../types";

export async function chatOpenAiCompatible(req: LlmChatRequest): Promise<LlmChatResponse> {
  const base = (req.provider.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (req.provider.apiKey?.trim()) {
    headers.Authorization = `Bearer ${req.provider.apiKey.trim()}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: req.provider.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.4,
      stream: false,
    }),
    signal: req.signal,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`LLM ${req.provider.id} failed (${res.status}): ${text.slice(0, 240)}`);
  }

  const json = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim() ?? "";
  return {
    content,
    providerId: req.provider.id,
    model: req.provider.model,
    toolCalls: [],
  };
}

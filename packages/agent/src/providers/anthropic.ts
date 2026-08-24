import type { LlmChatRequest, LlmChatResponse } from "../types";

export async function chatAnthropic(req: LlmChatRequest): Promise<LlmChatResponse> {
  const base = (req.provider.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
  const url = `${base}/v1/messages`;
  if (!req.provider.apiKey?.trim()) {
    throw new Error(`Anthropic provider "${req.provider.id}" requires an API key`);
  }

  const systemParts = req.messages.filter((m) => m.role === "system").map((m) => m.content);
  const nonSystem = req.messages.filter((m) => m.role !== "system");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": req.provider.apiKey.trim(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: req.provider.model,
      max_tokens: 2048,
      system: systemParts.join("\n\n") || undefined,
      messages: nonSystem.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      temperature: req.temperature ?? 0.4,
    }),
    signal: req.signal,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Anthropic ${req.provider.id} failed (${res.status}): ${text.slice(0, 240)}`);
  }

  const json = JSON.parse(text) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const content =
    json.content
      ?.filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("\n")
      .trim() ?? "";

  return {
    content,
    providerId: req.provider.id,
    model: req.provider.model,
    toolCalls: [],
  };
}

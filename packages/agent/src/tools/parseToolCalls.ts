import type { AgentToolCall } from "../types";

export function parseToolCallsFromText(text: string): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  for (const m of text.matchAll(/```tool\s*([\s\S]*?)```/gi)) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as {
        name?: string;
        arguments?: Record<string, unknown>;
        args?: Record<string, unknown>;
      };
      if (!parsed.name) continue;
      calls.push({
        name: parsed.name,
        arguments: parsed.arguments ?? parsed.args ?? {},
      });
    } catch {
      /* ignore malformed tool block */
    }
  }
  return calls;
}

export function stripToolBlocks(text: string): string {
  return text.replace(/```tool\s*[\s\S]*?```/gi, "").trim();
}

import type {
  AgentConfig,
  AgentMessage,
  AgentToolCall,
  AgentToolResult,
  ClassifiedAgentTask,
  UrlIntent,
} from "./types";
import { chatWithFailover, listEnabledProviders } from "./providers/registry";
import { classifyTextIntents, type ProviderResolver } from "./router/urlIntent";
import { classifyAgentTask } from "./skills/classifyTask";
import { getAgentSkill } from "./skills/registry";
import { parseToolCallsFromText, stripToolBlocks } from "./tools/parseToolCalls";

export type AgentToolExecutor = (call: AgentToolCall) => Promise<AgentToolResult>;

export interface RunAgentTurnOptions {
  config: AgentConfig;
  message: string;
  history?: AgentMessage[];
  providerId?: string;
  resolveProvider: ProviderResolver;
  executeTool: AgentToolExecutor;
  signal?: AbortSignal;
}

export interface AgentTurnResult {
  reply: string;
  providerId: string;
  model: string;
  intents: UrlIntent[];
  toolResults: AgentToolResult[];
  messages: AgentMessage[];
  task: ClassifiedAgentTask;
}

function nowId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function runToolPlan(
  plan: AgentToolCall[],
  executeTool: AgentToolExecutor
): Promise<AgentToolResult[]> {
  const results: AgentToolResult[] = [];
  for (const call of plan) {
    results.push(await executeTool(call));
  }
  return results;
}

export async function runAgentTurn(opts: RunAgentTurnOptions): Promise<AgentTurnResult> {
  const urlIntents = opts.config.autoAnalyzeUrls
    ? classifyTextIntents(opts.message, opts.resolveProvider)
    : [];

  const task = classifyAgentTask({ message: opts.message, urlIntents });
  const skill = getAgentSkill(task.skillId);

  const autoToolResults: AgentToolResult[] = [];
  if (task.toolPlan.length > 0 && (opts.config.autoExecuteTasks || skill?.autoExecute)) {
    autoToolResults.push(...(await runToolPlan(task.toolPlan, opts.executeTool)));
  } else if (urlIntents.length > 0 && opts.config.autoAnalyzeUrls && !opts.config.autoExecuteTasks) {
    // Analyze-only: detect + extract for collections, detect only for singles
    const analyzePlan = task.toolPlan.filter(
      (c) => c.name === "detect_url" || c.name === "extract_preview"
    );
    if (analyzePlan.length) {
      autoToolResults.push(...(await runToolPlan(analyzePlan, opts.executeTool)));
    }
  }

  const historyText = (opts.history ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const toolContext =
    autoToolResults.length > 0
      ? `\n\nTool results (skill: ${task.skillId}, intent: ${task.taskIntent}):\n${JSON.stringify(autoToolResults, null, 2)}`
      : "";

  const llmMessages = [
    { role: "system" as const, content: task.systemPrompt },
    ...historyText,
    { role: "user" as const, content: `${opts.message}${toolContext}` },
  ];

  const llm = await chatWithFailover(
    opts.config.providers,
    {
      messages: llmMessages,
      providerId: opts.providerId ?? opts.config.defaultProviderId,
      signal: opts.signal,
    },
    undefined
  );

  const toolResults = [...autoToolResults];
  const llmToolCalls = llm.toolCalls.length ? llm.toolCalls : parseToolCallsFromText(llm.content);
  for (const call of llmToolCalls) {
    const allowed = skill?.tools.includes(call.name) ?? true;
    if (!allowed) continue;
    const dup = toolResults.some(
      (r) => r.name === call.name && JSON.stringify(r.data) === JSON.stringify(call.arguments)
    );
    if (dup) continue;
    toolResults.push(await opts.executeTool(call));
  }

  let reply = stripToolBlocks(llm.content);
  if (!reply.trim() && toolResults.length > 0) {
    reply = summarizeToolResults(toolResults, urlIntents, task);
  }

  const stamp = Date.now();
  const messages: AgentMessage[] = [
    ...(opts.history ?? []),
    { id: nowId("user"), role: "user", content: opts.message, createdAt: stamp },
    { id: nowId("assistant"), role: "assistant", content: reply, createdAt: stamp + 1 },
  ];

  return {
    reply,
    providerId: llm.providerId,
    model: llm.model,
    intents: urlIntents,
    toolResults,
    messages,
    task,
  };
}

function summarizeToolResults(
  results: AgentToolResult[],
  intents: UrlIntent[],
  task: ClassifiedAgentTask
): string {
  const lines: string[] = [`Task: ${task.label} (${task.taskIntent})`];
  for (const intent of intents) {
    lines.push(
      `• ${intent.providerLabel ?? intent.providerId ?? "URL"} — ${intent.kind} (${intent.suggestedAction})`
    );
  }
  for (const r of results) {
    if (!r.ok) {
      lines.push(`• ${r.name} failed: ${r.error ?? "unknown error"}`);
      continue;
    }
    if (r.name === "extract_preview" && r.data && typeof r.data === "object") {
      const d = r.data as { itemCount?: number; title?: string };
      lines.push(`• Found ${d.itemCount ?? 0} items${d.title ? ` in “${d.title}”` : ""}.`);
    } else if (r.name === "start_download" || r.name === "queue_download") {
      lines.push(`• ${r.name.replace(/_/g, " ")} started.`);
    } else if (r.name === "detect_url" && r.data && typeof r.data === "object") {
      const d = r.data as { label?: string };
      lines.push(`• Detected provider: ${d.label ?? "unknown"}.`);
    }
  }
  return lines.join("\n") || "Done.";
}

export async function analyzeUrlWithAgent(opts: {
  url: string;
  config: AgentConfig;
  resolveProvider: ProviderResolver;
  executeTool: AgentToolExecutor;
  signal?: AbortSignal;
}): Promise<{
  intent: UrlIntent;
  toolResults: AgentToolResult[];
  summary?: string;
  task: ClassifiedAgentTask;
}> {
  const urlIntents = classifyTextIntents(opts.url, opts.resolveProvider);
  const intent = urlIntents[0] ?? {
    kind: "unknown" as const,
    url: opts.url,
    suggestedAction: "detect" as const,
    confidence: "low" as const,
  };

  const task = classifyAgentTask({ message: opts.url, urlIntents });
  const toolResults = await runToolPlan(task.toolPlan, opts.executeTool);

  let summary: string | undefined;
  if (opts.config.enabled && listEnabledProviders(opts.config.providers).length > 0) {
    try {
      const llm = await chatWithFailover(opts.config.providers, {
        providerId: opts.config.defaultProviderId,
        signal: opts.signal,
        messages: [
          { role: "system", content: task.systemPrompt },
          {
            role: "user",
            content: JSON.stringify({ intent, task, toolResults }, null, 2),
          },
        ],
      });
      summary = stripToolBlocks(llm.content);
    } catch {
      summary = summarizeToolResults(toolResults, urlIntents, task);
    }
  } else {
    summary = summarizeToolResults(toolResults, urlIntents, task);
  }

  return { intent, toolResults, summary, task };
}

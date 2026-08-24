export type AgentRole = "system" | "user" | "assistant" | "tool";

export type LlmProviderKind = "openai" | "anthropic" | "ollama" | "openclaw";

export interface AgentLlmProviderConfig {
  id: string;
  label: string;
  kind: LlmProviderKind;
  enabled: boolean;
  /** OpenAI-compatible base URL or provider endpoint root. */
  baseUrl?: string;
  apiKey?: string;
  model: string;
  /** Lower priority runs first for failover. */
  priority: number;
}

export interface AgentConfig {
  enabled: boolean;
  defaultProviderId: string;
  providers: AgentLlmProviderConfig[];
  /** Analyze pasted URLs before LLM reply. */
  autoAnalyzeUrls: boolean;
  /** Queue/start downloads when agent recommends a task. */
  autoExecuteTasks: boolean;
}

export const DEFAULT_AGENT_PROVIDERS: AgentLlmProviderConfig[] = [
  {
    id: "ollama-local",
    label: "Ollama (local)",
    kind: "ollama",
    enabled: true,
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.2",
    priority: 0,
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    priority: 10,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    enabled: false,
    baseUrl: "https://api.anthropic.com",
    model: "claude-3-5-haiku-20241022",
    priority: 20,
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    kind: "openclaw",
    enabled: false,
    baseUrl: "https://api.openclaw.ai/v1",
    model: "openclaw-1",
    priority: 30,
  },
];

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: false,
  defaultProviderId: "ollama-local",
  providers: DEFAULT_AGENT_PROVIDERS.map((p) => ({ ...p })),
  autoAnalyzeUrls: true,
  autoExecuteTasks: false,
};

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  /** Tool name when role=tool */
  toolName?: string;
  createdAt: number;
}

export interface AgentSession {
  id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

export type UrlIntentKind =
  | "single"
  | "board"
  | "profile"
  | "playlist"
  | "channel"
  | "search"
  | "unknown";

export interface UrlIntent {
  kind: UrlIntentKind;
  url: string;
  providerId?: string;
  providerLabel?: string;
  suggestedAction: "detect" | "extract" | "queue" | "download" | "none";
  confidence: "high" | "medium" | "low";
  reason?: string;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface AgentToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentToolResult {
  name: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface LlmChatRequest {
  provider: AgentLlmProviderConfig;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  temperature?: number;
}

export interface LlmChatResponse {
  content: string;
  providerId: string;
  model: string;
  toolCalls: AgentToolCall[];
}

export interface AgentChatRequest {
  sessionId?: string;
  message: string;
  /** Optional explicit provider; otherwise default/failover chain. */
  providerId?: string;
  signal?: AbortSignal;
}

export interface ClassifiedAgentTask {
  skillId: string;
  taskIntent: AgentTaskIntent;
  label: string;
  confidence: "high" | "medium" | "low";
  urlIntents: UrlIntent[];
  /** Planned tool calls for this task. */
  toolPlan: AgentToolCall[];
  /** Combined system prompt for LLM turn. */
  systemPrompt: string;
}

export type AgentTaskIntent =
  | "download_url"
  | "extract_collection"
  | "queue_urls"
  | "check_status"
  | "analyze_url"
  | "worker_health"
  | "chat"
  | "unknown";

export interface AgentSkillDefinition {
  id: string;
  label: string;
  description: string;
  taskIntent: AgentTaskIntent;
  /** Keywords from SKILL.md frontmatter — match user text for intent. */
  keywords?: string[];
  urlKinds?: UrlIntentKind[];
  urlActions?: Array<UrlIntent["suggestedAction"]>;
  /** Markdown body — prompt for AI when this skill is active. */
  prompt: string;
  tools: string[];
  priority: number;
  autoExecute?: boolean;
}

export interface ClassifyTaskInput {
  message: string;
  urlIntents?: UrlIntent[];
}

export interface AgentChatResponse {
  sessionId: string;
  reply: string;
  providerId: string;
  model: string;
  intents: UrlIntent[];
  toolResults: AgentToolResult[];
  /** Matched built-in skill for this turn. */
  skillId?: string;
  taskIntent?: AgentTaskIntent;
}

export interface AgentAnalyzeUrlRequest {
  url: string;
  signal?: AbortSignal;
}

export interface AgentAnalyzeUrlResponse {
  intent: UrlIntent;
  summary?: string;
  providerId?: string;
}

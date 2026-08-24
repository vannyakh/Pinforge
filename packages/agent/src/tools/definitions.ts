import type { AgentToolDefinition } from "../types";

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "detect_url",
    description: "Detect which download provider matches a media URL.",
    parameters: {
      url: { type: "string", description: "Media page URL", required: true },
    },
  },
  {
    name: "extract_preview",
    description: "List items in a board, profile, playlist, or channel URL.",
    parameters: {
      url: { type: "string", description: "Collection URL", required: true },
    },
  },
  {
    name: "queue_download",
    description: "Add URL(s) to the Tasks queue without starting immediately.",
    parameters: {
      urls: { type: "string[]", description: "One or more media URLs", required: true },
    },
  },
  {
    name: "start_download",
    description: "Start downloading a URL with current Settings defaults.",
    parameters: {
      url: { type: "string", description: "Media URL", required: true },
    },
  },
  {
    name: "get_status",
    description: "Read download folder, queue, and tool readiness.",
    parameters: {},
  },
  {
    name: "worker_ping",
    description: "Check Rust pinforge-worker availability for native enhance/download.",
    parameters: {},
  },
];

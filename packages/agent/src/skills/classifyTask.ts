import type { AgentToolCall, UrlIntent } from "../types";
import type { ClassifiedAgentTask, ClassifyTaskInput } from "./types";
import {
  buildSkillSystemPrompt,
  getAgentSkill,
  listAgentSkills,
} from "./registry";
import type { AgentSkillDefinition } from "./types";

function keywordHits(skill: AgentSkillDefinition, message: string): number {
  const lower = message.toLowerCase();
  return (skill.keywords ?? []).filter((kw) => lower.includes(kw.toLowerCase())).length;
}

function keywordHit(skill: AgentSkillDefinition, message: string): boolean {
  return keywordHits(skill, message) > 0;
}

function scoreSkill(skill: AgentSkillDefinition, message: string, urlIntents: UrlIntent[]): number {
  let score = 0;

  const hits = keywordHits(skill, message);
  if (hits > 0) score += 100 + (hits - 1) * 25;

  if (skill.id === "download-single" && hits > 0 && !urlIntents.some((i) => i.suggestedAction === "download")) {
    score -= 80;
  }

  for (const intent of urlIntents) {
    if (skill.urlKinds?.includes(intent.kind)) score += 50;
    if (skill.urlActions?.includes(intent.suggestedAction)) score += 30;
  }

  if (urlIntents.length > 0 && hits === 0) {
    if (skill.urlKinds?.some((k) => urlIntents.some((i) => i.kind === k))) score += 20;
  }

  return score - skill.priority * 0.1;
}

function pickBestSkill(message: string, urlIntents: UrlIntent[]): AgentSkillDefinition {
  const skills = listAgentSkills();
  const textMatched = skills.filter(
    (s) => s.id !== "general-chat" && keywordHit(s, message)
  );
  const pool = textMatched.length > 0 ? textMatched : skills;

  let best = skills.find((s) => s.id === "general-chat") ?? skills[skills.length - 1]!;
  let bestScore = -1;

  for (const skill of pool) {
    const score = scoreSkill(skill, message, urlIntents);
    if (score > bestScore) {
      bestScore = score;
      best = skill;
    }
  }

  if (bestScore <= 0) return getAgentSkill("general-chat") ?? best;
  return best;
}

function confidenceFromScore(score: number): ClassifiedAgentTask["confidence"] {
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

/** Build tool plan from skill + URL intents. */
export function buildToolPlan(skill: AgentSkillDefinition, urlIntents: UrlIntent[]): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  const urls = urlIntents.map((i) => i.url);

  switch (skill.taskIntent) {
    case "download_url":
      for (const url of urls) {
        if (skill.tools.includes("detect_url")) calls.push({ name: "detect_url", arguments: { url } });
        if (skill.tools.includes("start_download")) calls.push({ name: "start_download", arguments: { url } });
      }
      break;
    case "extract_collection":
      for (const intent of urlIntents) {
        if (skill.tools.includes("detect_url")) calls.push({ name: "detect_url", arguments: { url: intent.url } });
        if (skill.tools.includes("extract_preview")) calls.push({ name: "extract_preview", arguments: { url: intent.url } });
      }
      break;
    case "queue_urls":
      if (urls.length && skill.tools.includes("queue_download")) {
        calls.push({ name: "queue_download", arguments: { urls } });
      }
      break;
    case "check_status":
      if (skill.tools.includes("get_status")) calls.push({ name: "get_status", arguments: {} });
      break;
    case "worker_health":
      if (skill.tools.includes("worker_ping")) calls.push({ name: "worker_ping", arguments: {} });
      break;
    case "analyze_url":
      for (const intent of urlIntents) {
        calls.push({ name: "detect_url", arguments: { url: intent.url } });
        if (intent.suggestedAction === "extract" && skill.tools.includes("extract_preview")) {
          calls.push({ name: "extract_preview", arguments: { url: intent.url } });
        }
      }
      break;
    default:
      break;
  }

  return dedupeToolCalls(calls);
}

function dedupeToolCalls(calls: AgentToolCall[]): AgentToolCall[] {
  const seen = new Set<string>();
  return calls.filter((c) => {
    const key = `${c.name}:${JSON.stringify(c.arguments)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Classify message → skill (from SKILL.md registry) + tool plan. */
export function classifyAgentTask(input: ClassifyTaskInput): ClassifiedAgentTask {
  const urlIntents = input.urlIntents ?? [];
  const skill = pickBestSkill(input.message, urlIntents);
  const score = scoreSkill(skill, input.message, urlIntents);

  return {
    skillId: skill.id,
    taskIntent: skill.taskIntent,
    label: skill.label,
    confidence: confidenceFromScore(score),
    urlIntents,
    toolPlan: buildToolPlan(skill, urlIntents),
    systemPrompt: buildSkillSystemPrompt(skill),
  };
}

export function classifyAgentTaskFromUrls(message: string, urlIntents: UrlIntent[]): ClassifiedAgentTask {
  return classifyAgentTask({ message, urlIntents });
}

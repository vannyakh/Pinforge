import type { AgentSkillDefinition } from "./types";
import { loadSkillsFromDir, buildSkillCatalogPrompt } from "./loadSkillMd";

let cached: AgentSkillDefinition[] | null = null;

function ensureLoaded(): AgentSkillDefinition[] {
  if (!cached) cached = loadSkillsFromDir();
  return cached;
}

/** All skills loaded from packages/agent/skills/{name}/SKILL.md */
export function listAgentSkills(): AgentSkillDefinition[] {
  return [...ensureLoaded()].sort((a, b) => a.priority - b.priority);
}

export function getAgentSkill(id: string): AgentSkillDefinition | undefined {
  return ensureLoaded().find((s) => s.id === id);
}

/** Override or add a skill at runtime. */
export function registerAgentSkill(skill: AgentSkillDefinition): void {
  const skills = ensureLoaded();
  const idx = skills.findIndex((s) => s.id === skill.id);
  if (idx >= 0) skills[idx] = skill;
  else skills.push(skill);
  cached = skills.sort((a, b) => a.priority - b.priority);
}

export function reloadAgentSkills(): void {
  cached = null;
}

export function resetAgentSkills(): void {
  cached = null;
  ensureLoaded();
}

/** Base system prompt + skill catalog for intent classification. */
export function buildBaseAgentPrompt(): string {
  const skills = listAgentSkills();
  const toolNames = [...new Set(skills.flatMap((s) => s.tools))];
  return [
    "You are Pinforge Agent — a media download automation assistant.",
    "Available tools:",
    ...toolNames.map((t) => `- ${t}`),
    "",
    "To call a tool, emit a fenced block:",
    "```tool",
    '{"name":"detect_url","arguments":{"url":"https://..."}}',
    "```",
    "",
    buildSkillCatalogPrompt(skills),
  ].join("\n");
}

/** Full system prompt: base + active skill markdown body. */
export function buildSkillSystemPrompt(skill: AgentSkillDefinition): string {
  return [buildBaseAgentPrompt(), "", "---", "", skill.prompt].join("\n");
}

export function skillsForTool(toolName: string): AgentSkillDefinition[] {
  return listAgentSkills().filter((s) => s.tools.includes(toolName));
}

export { buildSkillCatalogPrompt, loadSkillsFromDir, parseSkillMd } from "./loadSkillMd";

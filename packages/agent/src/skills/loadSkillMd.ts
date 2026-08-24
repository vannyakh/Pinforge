import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSkillDefinition, AgentTaskIntent } from "../types";
import type { UrlIntentKind } from "../types";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Resolve `packages/agent/skills/` (sibling of `src/`). */
export function resolveSkillsDir(): string {
  const candidates = [
    join(HERE, "..", "..", "skills"),
    join(HERE, "..", "..", "..", "packages", "agent", "skills"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };

  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (m) meta[m[1]!] = m[2]!.trim();
  }
  return { meta, body: match[2]!.trim() };
}

function splitList(value?: string): string[] {
  if (!value?.trim()) return [];
  return value.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

export function parseSkillMd(content: string, fallbackId?: string): AgentSkillDefinition {
  const { meta, body } = parseFrontmatter(content);
  const id = meta.id ?? fallbackId ?? "unknown";

  return {
    id,
    label: meta.label ?? id,
    description: body.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? meta.label ?? id,
    taskIntent: (meta.taskIntent ?? "chat") as AgentTaskIntent,
    keywords: splitList(meta.keywords),
    urlKinds: splitList(meta.urlKinds) as UrlIntentKind[],
    urlActions: splitList(meta.urlActions) as AgentSkillDefinition["urlActions"],
    tools: splitList(meta.tools),
    priority: Number(meta.priority) || 100,
    autoExecute: meta.autoExecute !== "false",
    prompt: body,
  };
}

export function loadSkillFromFile(filePath: string): AgentSkillDefinition {
  const content = readFileSync(filePath, "utf8");
  const fallbackId = filePath.split(/[/\\]/).slice(-2, -1)[0];
  return parseSkillMd(content, fallbackId);
}

/** Load every `skills/<name>/SKILL.md` under the skills directory. */
export function loadSkillsFromDir(dir = resolveSkillsDir()): AgentSkillDefinition[] {
  if (!existsSync(dir)) return [];

  const skills: AgentSkillDefinition[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const md = join(dir, name.name, "SKILL.md");
    if (!existsSync(md)) continue;
    skills.push(loadSkillFromFile(md));
  }
  return skills.sort((a, b) => a.priority - b.priority);
}

/** Prompt block listing all skills for LLM intent classification. */
export function buildSkillCatalogPrompt(skills: AgentSkillDefinition[]): string {
  const lines = skills.map((s) => {
    const signals = [
      s.keywords?.length ? `keywords: ${s.keywords.join(", ")}` : "",
      s.urlKinds?.length ? `urlKinds: ${s.urlKinds.join(", ")}` : "",
      s.urlActions?.length ? `urlActions: ${s.urlActions.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    return `- **${s.id}** (${s.taskIntent}): ${s.label}. ${signals}`;
  });

  return [
    "## Available skills",
    "Pick the best skill id for the user message. Reply with JSON only:",
    '`{"skillId":"download-single","reason":"..."}`',
    "",
    ...lines,
  ].join("\n");
}

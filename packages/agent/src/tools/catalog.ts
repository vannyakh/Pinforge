import { AGENT_TOOLS } from "./definitions";
import { buildBaseAgentPrompt } from "../skills/registry";

export { AGENT_TOOLS };

/** @deprecated Use buildBaseAgentPrompt or buildSkillSystemPrompt from skills/registry. */
export function buildAgentSystemPrompt(): string {
  return buildBaseAgentPrompt();
}

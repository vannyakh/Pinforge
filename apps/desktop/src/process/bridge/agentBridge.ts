import type { IpcMain } from "electron";
import type { AgentConfig } from "@pinforge/agent";
import {
  agentAnalyzeUrl,
  agentChat,
  cancelAgentRequest,
  clearAgentSession,
  getAgentConfig,
  getAgentSession,
  listAgentProvidersForUi,
  listAgentSessions,
  setAgentConfig,
} from "../services/agent/AgentService";

export function registerAgentBridge(ipcMain: IpcMain): void {
  ipcMain.handle("agent:getConfig", async () => getAgentConfig());
  ipcMain.handle("agent:setConfig", async (_e, partial: Partial<AgentConfig>) =>
    setAgentConfig(partial)
  );
  ipcMain.handle("agent:listProviders", async () => listAgentProvidersForUi());
  ipcMain.handle("agent:listSkills", async () => {
    const { listAgentSkills } = await import("@pinforge/agent/skills");
    return listAgentSkills().map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      taskIntent: s.taskIntent,
      tools: s.tools,
    }));
  });
  ipcMain.handle("agent:sessions:list", async () => listAgentSessions());
  ipcMain.handle("agent:sessions:get", async (_e, id: string) => getAgentSession(id));
  ipcMain.handle("agent:sessions:clear", async (_e, id: string) => {
    clearAgentSession(id);
    return { ok: true };
  });
  ipcMain.handle(
    "agent:chat",
    async (
      _e,
      payload: { sessionId?: string; message: string; providerId?: string }
    ) => agentChat(payload)
  );
  ipcMain.handle("agent:analyzeUrl", async (_e, url: string) => agentAnalyzeUrl(url));
  ipcMain.handle("agent:cancel", async () => {
    cancelAgentRequest();
    return { ok: true };
  });
}

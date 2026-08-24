import React from "react";
import { Input, Select, Switch } from "@arco-design/web-react";
import { useApp } from "@renderer/hooks/context/AppContext";
import type { AgentLlmProviderConfig, LlmProviderKind } from "@renderer/api";
import {
  SettingsField,
  SettingsHeader,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "./components/SettingsLayout";

const KIND_LABELS: Record<LlmProviderKind, string> = {
  openai: "OpenAI-compatible",
  anthropic: "Anthropic",
  ollama: "Ollama (local)",
  openclaw: "OpenClaw bot",
};

const AgentSettings: React.FC = () => {
  const { settings, updateSettings } = useApp();
  if (!settings) return null;

  const agent = settings.agent;
  const providers = agent?.providers ?? [];

  const patchProvider = (id: string, patch: Partial<AgentLlmProviderConfig>) => {
    void updateSettings({
      agent: {
        providers: providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      },
    });
  };

  return (
    <SettingsPage width="narrow">
      <SettingsHeader
        title="Agent"
        description="Multi-LLM assistant for chat, URL intent routing, and download task automation. Integrates with core services and the Rust worker."
      />
      <SettingsSection title="Agent">
        <SettingsRow
          title="Enable agent"
          description="Allow chat and URL analysis through configured LLM providers."
        >
          <Switch
            checked={Boolean(agent?.enabled)}
            onChange={(v) => void updateSettings({ agent: { enabled: v } })}
          />
        </SettingsRow>
        <SettingsRow
          title="Auto-analyze URLs"
          description="When you paste links, run detect/extract tools before the LLM reply."
        >
          <Switch
            checked={agent?.autoAnalyzeUrls !== false}
            onChange={(v) => void updateSettings({ agent: { autoAnalyzeUrls: v } })}
          />
        </SettingsRow>
        <SettingsRow
          title="Auto-execute tasks"
          description="Let the agent queue or start downloads when it recommends an action."
        >
          <Switch
            checked={Boolean(agent?.autoExecuteTasks)}
            onChange={(v) => void updateSettings({ agent: { autoExecuteTasks: v } })}
          />
        </SettingsRow>
        <SettingsField title="Default provider" description="Primary model; others are failover.">
          <Select
            className="w-full"
            value={agent?.defaultProviderId}
            onChange={(v) => void updateSettings({ agent: { defaultProviderId: String(v) } })}
          >
            {providers.map((p) => (
              <Select.Option key={p.id} value={p.id}>
                {p.label} ({p.model})
              </Select.Option>
            ))}
          </Select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="LLM providers">
        {providers.map((p) => (
          <div key={p.id} className="mb-16px pb-16px border-b border-[var(--color-border-2)] last:border-0">
            <SettingsRow title={p.label} description={KIND_LABELS[p.kind]}>
              <Switch checked={p.enabled} onChange={(v) => patchProvider(p.id, { enabled: v })} />
            </SettingsRow>
            <SettingsField title="Model">
              <Input
                className="w-full"
                value={p.model}
                onChange={(v) => patchProvider(p.id, { model: v })}
              />
            </SettingsField>
            <SettingsField title="Base URL">
              <Input
                className="w-full"
                value={p.baseUrl ?? ""}
                placeholder="https://api.openai.com/v1"
                onChange={(v) => patchProvider(p.id, { baseUrl: v })}
              />
            </SettingsField>
            {p.kind !== "ollama" && (
              <SettingsField title="API key" description="Stored locally only.">
                <Input.Password
                  className="w-full"
                  value={p.apiKey ?? ""}
                  onChange={(v) => patchProvider(p.id, { apiKey: v })}
                />
              </SettingsField>
            )}
          </div>
        ))}
      </SettingsSection>
    </SettingsPage>
  );
};

export default AgentSettings;

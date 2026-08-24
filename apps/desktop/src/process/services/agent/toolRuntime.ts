import type { AgentToolCall, AgentToolResult } from "@pinforge/agent";
import { extractMediaPreview } from "@pinforge/core/preview";
import { rustPing, resolveWorkerBinary } from "@pinforge/worker";
import {
  detectRemoteUrl,
  downloadRemoteUrl,
  getRemoteToolStatus,
  queueRemoteUrls,
} from "../remoteTools";
import { resolveProviderForUrl } from "../../providerResolve";
import { getStore } from "../../store";
import type { IpcMainInvokeEvent } from "electron";

export type AgentToolRuntimeContext = {
  ipcEvent?: IpcMainInvokeEvent;
  runDownload?: (url: string) => Promise<{ ok: boolean; message?: string }>;
};

export async function executeAgentTool(
  call: AgentToolCall,
  ctx: AgentToolRuntimeContext = {}
): Promise<AgentToolResult> {
  try {
    switch (call.name) {
      case "detect_url": {
        const url = String(call.arguments.url ?? "");
        const hit = detectRemoteUrl(url);
        if (!hit.ok) {
          return { name: call.name, ok: false, error: hit.error ?? "Detect failed" };
        }
        return {
          name: call.name,
          ok: true,
          data: hit.provider ?? { url: hit.url },
        };
      }
      case "extract_preview": {
        const url = String(call.arguments.url ?? "");
        const store = getStore();
        const preview = await extractMediaPreview(url, {
          boardMaxPins: store.get("pinterest")?.boardMaxPins,
          channelMaxVideos: store.get("youtube")?.channelMaxVideos,
          playlistMaxVideos: store.get("youtube")?.playlistMaxVideos,
        });
        return {
          name: call.name,
          ok: true,
          data: {
            title: preview.title,
            mode: preview.mode,
            itemCount: preview.itemCount,
            truncated: preview.truncated,
            provider: preview.provider,
            items: preview.items.slice(0, 8),
          },
        };
      }
      case "queue_download": {
        const raw = call.arguments.urls;
        const urls = Array.isArray(raw)
          ? raw.map(String)
          : typeof raw === "string"
            ? [raw]
            : [];
        const count = queueRemoteUrls(urls);
        return { name: call.name, ok: count > 0, data: { queued: count, urls } };
      }
      case "start_download": {
        const url = String(call.arguments.url ?? "");
        if (ctx.runDownload) {
          const result = await ctx.runDownload(url);
          return {
            name: call.name,
            ok: result.ok,
            data: result,
            error: result.ok ? undefined : result.message,
          };
        }
        const result = await downloadRemoteUrl(url);
        return {
          name: call.name,
          ok: result.ok,
          data: result,
          error: result.ok ? undefined : result.message,
        };
      }
      case "get_status": {
        const status = await getRemoteToolStatus();
        return { name: call.name, ok: true, data: status };
      }
      case "worker_ping": {
        const bin = await resolveWorkerBinary();
        if (!bin) {
          return {
            name: call.name,
            ok: false,
            error: "Rust pinforge-worker binary not found",
            data: { available: false },
          };
        }
        const pong = await rustPing();
        return {
          name: call.name,
          ok: Boolean(pong),
          data: { available: Boolean(pong), binary: bin, pong },
        };
      }
      default:
        return { name: call.name, ok: false, error: `Unknown tool: ${call.name}` };
    }
  } catch (err) {
    return {
      name: call.name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function createProviderResolver() {
  return (url: string) => resolveProviderForUrl(url);
}

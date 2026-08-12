import { appendToPendingQueue } from "../downloadQueue";
import { resolveProviderForUrl, ProviderDisabledError } from "../providerResolve";
import { getStore } from "../store";

export type RemoteToolStatus = {
  ok: boolean;
  outDir: string;
  outDirReady: boolean;
  queueCount: number;
  runningPacks: number;
  enabledChannels: string[];
};

export type RemoteDetectResult = {
  ok: boolean;
  url: string;
  provider?: { id: string; label: string; live: boolean };
  error?: string;
};

export const REMOTE_API_TOOLS = [
  {
    name: "health",
    method: "GET",
    path: "/health",
    description: "Check if the Pinforge remote service is running.",
  },
  {
    name: "status",
    method: "GET",
    path: "/api/status",
    description: "Get download folder, queue size, and enabled channels.",
  },
  {
    name: "tools",
    method: "GET",
    path: "/api/tools",
    description: "List available remote tool endpoints for chatbot agents.",
  },
  {
    name: "detect",
    method: "POST",
    path: "/api/detect",
    description: "Detect which provider matches a media URL.",
    body: { url: "https://…" },
  },
  {
    name: "queue",
    method: "POST",
    path: "/api/queue",
    description: "Add URLs to the Tasks queue without starting immediately.",
    body: { urls: ["https://…"] },
  },
  {
    name: "download",
    method: "POST",
    path: "/api/download",
    description: "Start a download immediately using current Settings.",
    body: { url: "https://…" },
  },
] as const;

export function getRemoteToolStatus(): RemoteToolStatus {
  const store = getStore();
  const outDir = store.get("outDir") ?? "";
  const remote = store.get("remote");
  return {
    ok: true,
    outDir,
    outDirReady: Boolean(outDir.trim()),
    queueCount: (store.get("pendingQueue") ?? []).length,
    runningPacks: store.get("packs").filter((p) => p.status === "running").length,
    enabledChannels: remote.channels.filter((c) => c.enabled && c.available).map((c) => String(c.id)),
  };
}

export function detectRemoteUrl(url: string): RemoteDetectResult {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, url: trimmed, error: "Missing url" };
  try {
    const hit = resolveProviderForUrl(trimmed);
    if (!hit) return { ok: false, url: trimmed, error: "No provider matches this URL" };
    return {
      ok: true,
      url: trimmed,
      provider: { id: hit.id, label: hit.label, live: hit.live },
    };
  } catch (err) {
    if (err instanceof ProviderDisabledError) {
      return {
        ok: false,
        url: trimmed,
        error: `${err.providerLabel} is disabled in Settings → Providers`,
      };
    }
    return { ok: false, url: trimmed, error: err instanceof Error ? err.message : String(err) };
  }
}

export type RemoteDownloadOverrides = {
  format?: import("@pinforge/core/types").FormatPreset;
  youtube?: Partial<import("@pinforge/core/types").YoutubeDownloadOptions>;
};

export function queueRemoteUrls(urls: string[], override?: RemoteDownloadOverrides): number {
  return appendToPendingQueue(urls, override);
}

export async function downloadRemoteUrl(
  url: string,
  override?: RemoteDownloadOverrides
): Promise<{ ok: boolean; message: string; packId?: string }> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, message: "Missing url" };

  const store = getStore();
  const outDir = store.get("outDir")?.trim();
  if (!outDir) {
    return { ok: false, message: "Set a download folder in Settings → Download first." };
  }

  const detected = detectRemoteUrl(trimmed);
  if (!detected.ok) return { ok: false, message: detected.error ?? "URL not supported" };

  const { runProcessForRemote } = await import("../ipc");
  void runProcessForRemote({
    url: trimmed,
    format: override?.format,
    youtube: override?.youtube,
  }).catch(() => undefined);
  return { ok: true, message: `Download started for ${trimmed}` };
}

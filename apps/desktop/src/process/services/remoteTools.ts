import { listProviders } from "@pinforge/core/providers";
import { appendToPendingQueue, normalizeMediaUrl } from "../downloadQueue";
import {
  buildInstalledViews,
  resolveProviderForUrl,
  ProviderDisabledError,
} from "../providerResolve";
import { getStore } from "../store";
import { getFfmpegStatus } from "../ffmpegInstall";
import { getYtdlpStatus } from "../ytdlpInstall";

export type RemoteToolStatus = {
  ok: boolean;
  outDir: string;
  outDirReady: boolean;
  queueCount: number;
  runningPacks: number;
  enabledChannels: string[];
  /** Same provider tools the desktop download stack can use. */
  providers: Array<{
    id: string;
    label: string;
    enabled: boolean;
    live: boolean;
    hosts: string;
    formats: string[];
  }>;
  tools: {
    ffmpeg: { available: boolean; path?: string | null };
    ytdlp: { available: boolean; path?: string | null; enabled: boolean };
  };
};

export type RemoteDetectResult = {
  ok: boolean;
  url: string;
  provider?: {
    id: string;
    label: string;
    live: boolean;
    formats?: string[];
    modes?: string[];
  };
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
    description: "Download folder, queue, providers, and tool readiness (same as desktop).",
  },
  {
    name: "tools",
    method: "GET",
    path: "/api/tools",
    description: "List available remote tool endpoints for chatbot agents.",
  },
  {
    name: "providers",
    method: "GET",
    path: "/api/providers",
    description: "List desktop providers remote downloads can use (YouTube, Pinterest, yt-dlp, …).",
  },
  {
    name: "detect",
    method: "POST",
    path: "/api/detect",
    description: "Detect which desktop provider matches a media URL.",
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
    description: "Start a download with the same Settings → Download / Providers stack as desktop.",
    body: { url: "https://…" },
  },
] as const;

export async function getRemoteToolStatus(): Promise<RemoteToolStatus> {
  const store = getStore();
  const outDir = store.get("outDir") ?? "";
  const remote = store.get("remote");
  const system = store.get("system");
  const [ffmpeg, ytdlp] = await Promise.all([getFfmpegStatus(), getYtdlpStatus()]);
  const installed = buildInstalledViews(listProviders());
  const cores = listProviders();

  return {
    ok: true,
    outDir,
    outDirReady: Boolean(outDir.trim()),
    queueCount: (store.get("pendingQueue") ?? []).length,
    runningPacks: store.get("packs").filter((p) => p.status === "running").length,
    enabledChannels: remote.channels
      .filter((c) => c.enabled && c.available)
      .map((c) => String(c.id)),
    providers: installed.map((p) => {
      const core = cores.find((c) => c.id === p.id);
      return {
        id: p.id,
        label: p.label,
        enabled: p.enabled,
        live: p.live,
        hosts: p.hosts || (p.id === "ytdlp" ? "* (any http/https)" : ""),
        formats: (core?.formats ?? ["best"]).map(String),
      };
    }),
    tools: {
      ffmpeg: { available: ffmpeg.available, path: ffmpeg.path },
      ytdlp: {
        available: ytdlp.available,
        path: ytdlp.path,
        enabled: Boolean(system.ytdlpEnabled) && ytdlp.available,
      },
    },
  };
}

/** List providers remote can use — mirrors desktop Settings → Providers. */
export function listRemoteProviders() {
  const cores = listProviders();
  return buildInstalledViews(cores).map((p) => {
    const core = cores.find((c) => c.id === p.id);
    return {
      id: p.id,
      label: p.label,
      enabled: p.enabled,
      live: p.live,
      hosts: p.hosts || (p.id === "ytdlp" ? "* (any http/https via yt-dlp)" : ""),
      formats: (core?.formats ?? ["best"]).map(String),
      modes: (core?.modes ?? ["single"]).map(String),
    };
  });
}

export function detectRemoteUrl(url: string): RemoteDetectResult {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, url: trimmed, error: "Missing url" };

  const normalized = normalizeMediaUrl(trimmed) ?? trimmed;
  try {
    const hit = resolveProviderForUrl(normalized);
    if (!hit) {
      return {
        ok: false,
        url: normalized,
        error:
          "No provider matches this URL. Enable yt-dlp in Settings → System / Providers for catch-all sites.",
      };
    }
    if (!hit.live) {
      return {
        ok: false,
        url: normalized,
        provider: {
          id: hit.id,
          label: hit.label,
          live: false,
          formats: hit.formats,
          modes: hit.modes,
        },
        error: `${hit.label} is not live yet on this build.`,
      };
    }
    return {
      ok: true,
      url: normalized,
      provider: {
        id: hit.id,
        label: hit.label,
        live: hit.live,
        formats: hit.formats,
        modes: hit.modes,
      },
    };
  } catch (err) {
    if (err instanceof ProviderDisabledError) {
      return {
        ok: false,
        url: normalized,
        error: `${err.providerLabel} is disabled in Settings → Providers`,
      };
    }
    return { ok: false, url: normalized, error: err instanceof Error ? err.message : String(err) };
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

  // Catch-all sites need yt-dlp enabled the same way as desktop downloads.
  if (detected.provider?.id === "ytdlp") {
    const ytdlp = await getYtdlpStatus();
    const system = store.get("system");
    if (!ytdlp.available || !system.ytdlpEnabled) {
      return {
        ok: false,
        message:
          "This URL uses yt-dlp (same as desktop). Install/enable yt-dlp in Settings → System first.",
      };
    }
  }

  const { runProcessForRemote } = await import("../ipc");
  void runProcessForRemote({
    url: detected.url,
    format: override?.format,
    youtube: override?.youtube,
  }).catch(() => undefined);
  return { ok: true, message: `Download started for ${detected.url}` };
}

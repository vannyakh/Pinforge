import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extractMediaUrls } from "../downloadQueue";
import {
  REMOTE_API_TOOLS,
  detectRemoteUrl,
  downloadRemoteUrl,
  getRemoteToolStatus,
  queueRemoteUrls,
} from "../services/remoteTools";

export type RemoteApiHandlers = {
  onQueueUrls: (urls: string[]) => number;
  onDownloadUrl: (url: string) => Promise<{ packId?: string; message: string; ok?: boolean }>;
  onRegisterSendBack?: (url: string, target: { channel: string; chatId?: number }) => void;
};

export type RemoteApiServer = {
  port: number;
  url: string;
  close: () => Promise<void>;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parseJsonBody(raw: string): unknown {
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

export async function startRemoteApiServer(
  port: number,
  host: string,
  handlers: RemoteApiHandlers
): Promise<RemoteApiServer> {
  const server: Server = createServer((req, res) => {
    void handleRequest(req, res, handlers).catch((err) => {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;

  return {
    port: actualPort,
    url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${actualPort}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handlers: RemoteApiHandlers
): Promise<void> {
  const method = req.method ?? "GET";
  const path = (req.url ?? "/").split("?")[0] ?? "/";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true, service: "pinforge-remote" });
    return;
  }

  if (method === "GET" && path === "/api/status") {
    sendJson(res, 200, getRemoteToolStatus());
    return;
  }

  if (method === "GET" && path === "/api/tools") {
    sendJson(res, 200, { ok: true, tools: REMOTE_API_TOOLS });
    return;
  }

  if (method === "POST" && path === "/api/detect") {
    const raw = await readBody(req);
    const body = parseJsonBody(raw) as { url?: string; text?: string };
    const url =
      (typeof body.url === "string" && body.url.trim()) ||
      (typeof body.text === "string" ? extractMediaUrls(body.text)[0] : undefined);
    if (!url) {
      sendJson(res, 400, { ok: false, error: "Missing url" });
      return;
    }
    sendJson(res, 200, detectRemoteUrl(url));
    return;
  }

  if (method === "POST" && path === "/api/queue") {
    const raw = await readBody(req);
    const body = parseJsonBody(raw) as { urls?: string[]; text?: string };
    const urls = Array.isArray(body.urls)
      ? body.urls.filter(Boolean)
      : typeof body.text === "string"
        ? extractMediaUrls(body.text)
        : [];
    const queued = handlers.onQueueUrls(urls);
    sendJson(res, 200, { ok: true, queued });
    return;
  }

  if (method === "POST" && path === "/api/download") {
    const raw = await readBody(req);
    const body = parseJsonBody(raw) as {
      url?: string;
      text?: string;
      replyTo?: { channel?: string; chatId?: number };
    };
    const url =
      (typeof body.url === "string" && body.url.trim()) ||
      (typeof body.text === "string" ? extractMediaUrls(body.text)[0] : undefined);
    if (!url) {
      sendJson(res, 400, { ok: false, error: "Missing url" });
      return;
    }
    if (body.replyTo?.channel === "telegram" && typeof body.replyTo.chatId === "number") {
      handlers.onRegisterSendBack?.(url, {
        channel: "telegram",
        chatId: body.replyTo.chatId,
      });
    }
    const result = await handlers.onDownloadUrl(url);
    sendJson(res, result.ok === false ? 400 : 200, result);
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

/** Default handlers wired to shared remote tools (used by remoteRuntime). */
export function createDefaultRemoteApiHandlers(
  registerSendBack?: RemoteApiHandlers["onRegisterSendBack"]
): RemoteApiHandlers {
  return {
    onQueueUrls: (urls) => queueRemoteUrls(urls),
    onDownloadUrl: (url) => downloadRemoteUrl(url),
    onRegisterSendBack: registerSendBack,
  };
}

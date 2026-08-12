import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extractMediaUrls } from "../downloadQueue";

export type RemoteApiHandlers = {
  onQueueUrls: (urls: string[]) => number;
  onDownloadUrl: (url: string) => Promise<{ packId?: string; message: string }>;
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

  if (method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true, service: "pinforge-remote" });
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
    const body = parseJsonBody(raw) as { url?: string; text?: string };
    const url =
      (typeof body.url === "string" && body.url.trim()) ||
      (typeof body.text === "string" ? extractMediaUrls(body.text)[0] : undefined);
    if (!url) {
      sendJson(res, 400, { ok: false, error: "Missing url" });
      return;
    }
    const result = await handlers.onDownloadUrl(url);
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

/**
 * Long-lived pinforge-server JSON-RPC client (stdio NDJSON).
 * Electron-free — callers pass dataDir when starting.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { candidateServerBinaries, parseServerResponseLine } from "./paths";

let cachedServerBin: string | null | undefined;

export async function resolveServerBinary(): Promise<string | null> {
  if (cachedServerBin !== undefined) return cachedServerBin;
  for (const p of candidateServerBinaries()) {
    try {
      await access(p, constants.X_OK).catch(async () => access(p, constants.F_OK));
      cachedServerBin = p;
      return p;
    } catch {
      /* next */
    }
  }
  cachedServerBin = null;
  return null;
}

export function resetServerBinaryCache(): void {
  cachedServerBin = undefined;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export class PinforgeServerClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, Pending>();
  private buffer = "";
  private ready = false;
  private starting: Promise<void> | null = null;

  get isRunning(): boolean {
    return Boolean(this.child && !this.child.killed && this.ready);
  }

  async start(dataDir?: string): Promise<boolean> {
    if (this.isRunning) return true;
    if (this.starting) {
      await this.starting;
      return this.ready;
    }
    this.starting = this.doStart(dataDir);
    try {
      await this.starting;
      return this.ready;
    } finally {
      this.starting = null;
    }
  }

  private async doStart(dataDir?: string): Promise<void> {
    const bin = await resolveServerBinary();
    if (!bin) {
      this.ready = false;
      return;
    }

    this.child = spawn(bin, [], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...(dataDir ? { PINFORGE_DATA_DIR: dataDir } : {}),
      },
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk: string) => {
      this.emit("stderr", chunk);
    });
    this.child.on("exit", (code) => {
      this.ready = false;
      for (const [, p] of this.pending) {
        p.reject(new Error(`pinforge-server exited (${code})`));
      }
      this.pending.clear();
      this.child = null;
      this.emit("exit", code);
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        void this.request("ping")
          .then(() => {
            this.ready = true;
            resolve();
          })
          .catch(reject);
      }, 8000);

      const onReady = () => {
        cleanup();
        this.ready = true;
        resolve();
      };
      const onExit = (code: number | null) => {
        cleanup();
        reject(new Error(`pinforge-server exited during start (${code})`));
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.off("server.ready", onReady);
        this.off("exit", onExit);
      };
      this.once("server.ready", onReady);
      this.once("exit", onExit);
    });
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let parsed: ReturnType<typeof parseServerResponseLine>;
    try {
      parsed = parseServerResponseLine(line);
    } catch {
      this.emit("parseError", line);
      return;
    }

    if (parsed.kind === "event") {
      const event = parsed.event!;
      const payload = parsed.payload;
      this.emit(event, payload);
      this.emit("event", event, payload);
      if (event === "server.ready") this.ready = true;
      return;
    }

    const id = parsed.id;
    if (id && this.pending.has(id)) {
      const p = this.pending.get(id)!;
      this.pending.delete(id);
      if (parsed.kind === "error") {
        p.reject(new Error(parsed.error ?? "server error"));
      } else {
        p.resolve(parsed.result);
      }
    }
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.child?.stdin) {
      throw new Error("pinforge-server is not running");
    }
    const id = randomUUID();
    const payload = JSON.stringify({ id, method, params: params ?? {} }) + "\n";
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
    });
    this.child.stdin.write(payload);
    return promise;
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    try {
      await this.request("shutdown");
    } catch {
      /* ignore */
    }
    const child = this.child;
    this.child = null;
    this.ready = false;
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* */
        }
        resolve();
      }, 2000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}

let singleton: PinforgeServerClient | null = null;

export function getServerClient(): PinforgeServerClient {
  if (!singleton) singleton = new PinforgeServerClient();
  return singleton;
}

export async function ensureServer(dataDir?: string): Promise<PinforgeServerClient | null> {
  const client = getServerClient();
  const ok = await client.start(dataDir);
  return ok ? client : null;
}

export async function serverAvailable(): Promise<boolean> {
  const client = getServerClient();
  if (client.isRunning) return true;
  return Boolean(await resolveServerBinary());
}

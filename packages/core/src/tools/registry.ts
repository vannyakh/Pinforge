/**
 * System tools registry — ffmpeg / yt-dlp resolved for job processing.
 * Desktop configures via configureFfmpeg / configureYtdlp.
 */

import { configureFfmpeg, resolveFfmpeg, requireFfmpegMessage } from "../providers/youtube/mux";
import { configureYtdlp, resolveYtdlp, requireYtdlpMessage } from "../providers/ytdlp/bin";

export type ToolName = "ffmpeg" | "ytdlp";

export interface ToolResolveResult {
  name: ToolName;
  available: boolean;
  path: string | null;
  message?: string;
}

export class ToolRegistry {
  configureFfmpeg(opts: { path?: string; enabled?: boolean }): void {
    configureFfmpeg(opts);
  }

  configureYtdlp(opts: { path?: string; enabled?: boolean }): void {
    configureYtdlp(opts);
  }

  async resolve(name: ToolName): Promise<ToolResolveResult> {
    if (name === "ffmpeg") {
      const bin = await resolveFfmpeg();
      return {
        name: "ffmpeg",
        available: Boolean(bin),
        path: bin,
        message: bin ? undefined : requireFfmpegMessage(),
      };
    }
    if (name === "ytdlp") {
      const bin = await resolveYtdlp();
      return {
        name: "ytdlp",
        available: Boolean(bin),
        path: bin,
        message: bin ? undefined : requireYtdlpMessage(),
      };
    }
    return { name, available: false, path: null, message: "Unknown tool" };
  }

  async require(name: ToolName): Promise<string> {
    const hit = await this.resolve(name);
    if (!hit.available || !hit.path) {
      throw new Error(hit.message ?? `${name} is not available`);
    }
    return hit.path;
  }
}

export const tools = new ToolRegistry();

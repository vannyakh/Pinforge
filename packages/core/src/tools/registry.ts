/**
 * System tools registry — ffmpeg (and future tools) resolved for job processing.
 * Desktop configures via configureFfmpeg / ToolRegistry.configure.
 */

import { configureFfmpeg, resolveFfmpeg, requireFfmpegMessage } from "../providers/youtube/mux";

export type ToolName = "ffmpeg";

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

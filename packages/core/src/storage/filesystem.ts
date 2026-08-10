import fs from "node:fs/promises";
import path from "node:path";

export interface Storage {
  ensureDir(dir: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  getSize(filePath: string): Promise<number>;
  readText(filePath: string): Promise<string>;
  writeText(filePath: string, data: string): Promise<void>;
  writeJson(filePath: string, data: unknown): Promise<void>;
  readJson<T>(filePath: string): Promise<T | null>;
  remove(filePath: string): Promise<void>;
  removeDir(dir: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export class FilesystemStorage implements Storage {
  async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getSize(filePath: string): Promise<number> {
    try {
      const st = await fs.stat(filePath);
      return st.size;
    } catch {
      return 0;
    }
  }

  async readText(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf8");
  }

  async writeText(filePath: string, data: string): Promise<void> {
    await this.ensureDir(path.dirname(filePath));
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data, "utf8");
    await fs.rename(tmp, filePath);
  }

  async writeJson(filePath: string, data: unknown): Promise<void> {
    await this.writeText(filePath, JSON.stringify(data, null, 2));
  }

  async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await this.readText(filePath);
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async remove(filePath: string): Promise<void> {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
  }

  async removeDir(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  async rename(from: string, to: string): Promise<void> {
    await this.ensureDir(path.dirname(to));
    await fs.rename(from, to);
  }
}

export function jobWorkDir(baseDir: string, jobId: string): string {
  return path.join(baseDir, jobId);
}

export function partPathFor(destPath: string): string {
  return `${destPath}.part`;
}

export function checkpointPathFor(jobDir: string): string {
  return path.join(jobDir, "checkpoint.json");
}

export function segmentsDirFor(jobDir: string): string {
  return path.join(jobDir, "segments");
}

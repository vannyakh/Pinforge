import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * Zip a folder into `outZipPath` using OS tools (no extra npm deps).
 * Windows: PowerShell Compress-Archive; Unix: `zip -r`.
 */
export async function zipFolder(folderPath: string, outZipPath?: string): Promise<string> {
  const abs = path.resolve(folderPath);
  const st = await fs.stat(abs);
  if (!st.isDirectory()) throw new Error("ZIP source must be a directory");

  const dest = outZipPath ?? path.join(path.dirname(abs), `${path.basename(abs)}.zip`);

  try {
    await fs.unlink(dest);
  } catch {
    /* ok if missing */
  }

  if (process.platform === "win32") {
    await run("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path ${psQuote(path.join(abs, "*"))} -DestinationPath ${psQuote(dest)} -Force`,
    ]);
  } else {
    await run("zip", ["-r", "-q", dest, "."], abs);
  }

  await fs.access(dest);
  return dest;
}

/**
 * Zip a list of files into `outZipPath` (basenames only — no folder tree).
 * Windows: PowerShell Compress-Archive; Unix: `zip -j`.
 */
export async function zipFiles(filePaths: string[], outZipPath: string): Promise<string> {
  const files: string[] = [];
  for (const raw of filePaths) {
    const abs = path.resolve(raw);
    try {
      const st = await fs.stat(abs);
      if (st.isFile()) files.push(abs);
    } catch {
      /* skip missing */
    }
  }
  if (files.length === 0) throw new Error("No files to zip");

  const dest = path.resolve(outZipPath);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.unlink(dest);
  } catch {
    /* ok if missing */
  }

  if (process.platform === "win32") {
    const list = files.map(psQuote).join(",");
    await run("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path @(${list}) -DestinationPath ${psQuote(dest)} -Force`,
    ]);
  } else {
    await run("zip", ["-j", "-q", dest, ...files]);
  }

  await fs.access(dest);
  return dest;
}

function psQuote(p: string): string {
  return `'${p.replace(/'/g, "''")}'`;
}

function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `${cmd} exited ${code}`));
    });
  });
}

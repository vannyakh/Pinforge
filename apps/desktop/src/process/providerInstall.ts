import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { app } from "electron";
import {
  MANIFEST_FILENAMES,
  type FormatPluginConfig,
  type ProviderEngineId,
  type ProviderManifest,
} from "../common/providers/types";

export function extensionsRoot(): string {
  return join(app.getPath("userData"), "extensions", "providers");
}

export function formatPluginsRoot(): string {
  return join(app.getPath("userData"), "extensions", "format-plugins");
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function findManifestPath(dirOrFile: string): string | null {
  const target = dirOrFile;
  if (!existsSync(target)) return null;

  const st = statSync(target);
  if (st.isFile()) {
    const name = basename(target).toLowerCase();
    if (MANIFEST_FILENAMES.some((f) => f === name) || name.endsWith(".json")) {
      return target;
    }
    const parent = dirname(target);
    for (const file of MANIFEST_FILENAMES) {
      const p = join(parent, file);
      if (existsSync(p)) return p;
    }
    return null;
  }

  for (const file of MANIFEST_FILENAMES) {
    const p = join(target, file);
    if (existsSync(p)) return p;
  }
  // zip extract may nest a single root folder
  const kids = readdirSync(target);
  if (kids.length === 1) {
    const nested = join(target, kids[0]!);
    if (statSync(nested).isDirectory()) return findManifestPath(nested);
  }
  return null;
}

export function readProviderManifest(manifestPath: string): ProviderManifest {
  const raw = readFileSync(manifestPath, "utf-8");
  const data = JSON.parse(raw) as ProviderManifest;
  if (!data.id || !data.name) {
    throw new Error("Manifest must include id and name");
  }
  if (!data.version) data.version = "0.0.0";
  return data;
}

function copyTree(src: string, dest: string): void {
  ensureDir(dest);
  const st = statSync(src);
  if (st.isFile()) {
    copyFileSync(src, join(dest, basename(src)));
    return;
  }
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) copyTree(from, to);
    else copyFileSync(from, to);
  }
}

function listFilesRecursive(root: string, base = root): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursive(full, base));
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Stable SHA-256 of package files (paths + contents). Excludes nothing — include manifest. */
export async function hashProviderPackage(packageRoot: string): Promise<string> {
  const hash = createHash("sha256");
  const files = listFilesRecursive(packageRoot);
  for (const rel of files) {
    hash.update(rel);
    hash.update("\0");
    const buf = readFileSync(join(packageRoot, rel));
    hash.update(buf);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  ensureDir(destDir);
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const ps = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
      );
      let err = "";
      ps.stderr?.on("data", (d: Buffer) => {
        err += d.toString();
      });
      ps.on("error", reject);
      ps.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(err.trim() || `Expand-Archive exited ${code}`));
      });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn("unzip", ["-o", zipPath, "-d", destDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `unzip exited ${code}`));
    });
  });
}

function resolvePackageRoot(extractedOrFolder: string): string {
  const manifestPath = findManifestPath(extractedOrFolder);
  if (!manifestPath) {
    throw new Error("No pinforge.provider.json or manifest.json found in package");
  }
  return dirname(manifestPath);
}

export interface InstallProviderResult {
  installDir: string;
  manifestPath: string;
  manifest: ProviderManifest;
  checksum: string;
}

/** Install a provider package (folder, .zip, or file+sibling manifest) into userData. */
export async function installProviderFromSource(
  sourcePath: string
): Promise<InstallProviderResult> {
  if (!existsSync(sourcePath)) {
    throw new Error("Source path does not exist");
  }

  let workRoot = sourcePath;
  let tempExtract: string | null = null;
  const st = statSync(sourcePath);

  if (st.isFile() && /\.zip$/i.test(sourcePath)) {
    tempExtract = join(
      tmpdir(),
      `pinforge-provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    );
    await extractZip(sourcePath, tempExtract);
    workRoot = resolvePackageRoot(tempExtract);
  } else if (st.isFile()) {
    const manifestPath = findManifestPath(sourcePath);
    if (!manifestPath) {
      // scaffold beside single file
      const packageRoot = dirname(sourcePath);
      const base = basename(sourcePath, extname(sourcePath));
      const id =
        base
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || `provider-${Date.now().toString(36)}`;
      const manifest: ProviderManifest = {
        id,
        name: base || id,
        version: "0.1.0",
        description: "Uploaded provider package",
        engine: "script",
        hosts: [],
        formats: ["best"],
        capabilities: ["metadata.fetch"],
        main: basename(sourcePath),
      };
      const scaffoldPath = join(packageRoot, "pinforge.provider.json");
      writeFileSync(scaffoldPath, JSON.stringify(manifest, null, 2), "utf-8");
      workRoot = packageRoot;
    } else {
      workRoot = dirname(manifestPath);
    }
  } else {
    workRoot = resolvePackageRoot(sourcePath);
  }

  try {
    const manifestPath = findManifestPath(workRoot);
    if (!manifestPath) throw new Error("Manifest missing after prepare");
    let manifest = readProviderManifest(manifestPath);

    const expected = (manifest.checksum || "").trim().toLowerCase();
    const checksum = await hashProviderPackage(workRoot);
    if (expected && expected !== checksum) {
      throw new Error(
        `Package checksum mismatch (expected ${expected.slice(0, 12)}…, got ${checksum.slice(0, 12)}…)`
      );
    }

    const installDir = join(extensionsRoot(), manifest.id);
    ensureDir(extensionsRoot());
    if (existsSync(installDir)) {
      rmSync(installDir, { recursive: true, force: true });
    }
    ensureDir(installDir);
    copyTree(workRoot, installDir);

    const installedManifest = join(installDir, "pinforge.provider.json");
    if (!existsSync(installedManifest)) {
      writeFileSync(installedManifest, JSON.stringify(manifest, null, 2), "utf-8");
    }
    const finalPath = existsSync(installedManifest)
      ? installedManifest
      : findManifestPath(installDir)!;
    const finalManifest = readProviderManifest(finalPath);
    const finalChecksum = await hashProviderPackage(installDir);
    // If package declared a checksum, re-verify after copy
    if (expected && expected !== finalChecksum && expected !== checksum) {
      throw new Error("Package checksum mismatch after install");
    }

    return {
      installDir,
      manifestPath: finalPath,
      manifest: finalManifest,
      checksum: expected || finalChecksum,
    };
  } finally {
    if (tempExtract) {
      try {
        rmSync(tempExtract, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

export function uninstallProviderFiles(providerId: string): void {
  const dir = join(extensionsRoot(), providerId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function installFormatPlugin(sourcePath: string): FormatPluginConfig {
  if (!existsSync(sourcePath)) throw new Error("Plugin file does not exist");
  ensureDir(formatPluginsRoot());
  const name = basename(sourcePath);
  const id =
    name
      .replace(/\.(js|mjs|cjs|json|zip)$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `fmt-${Date.now().toString(36)}`;
  const dest = join(formatPluginsRoot(), `${id}${extname(sourcePath) || ".js"}`);
  copyFileSync(sourcePath, dest);

  let label = id;
  let entry: string | undefined;
  let version: string | undefined;
  if (/\.json$/i.test(sourcePath)) {
    try {
      const meta = JSON.parse(readFileSync(sourcePath, "utf-8")) as {
        name?: string;
        id?: string;
        entry?: string;
        main?: string;
        version?: string;
      };
      label = meta.name || meta.id || label;
      entry = meta.entry || meta.main;
      version = meta.version;
    } catch {
      // plain file
    }
  }

  return {
    id,
    label,
    enabled: true,
    sourcePath: dest,
    entry,
    version,
    createdAt: Date.now(),
  };
}

export function defaultEngineForProvider(id: string): ProviderEngineId {
  if (id === "youtube") return "piped";
  if (id === "pinterest") return "builtin";
  return "http-meta";
}

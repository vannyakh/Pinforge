import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
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
    // If user picked a zip/js, look beside it
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

export interface InstallProviderResult {
  installDir: string;
  manifestPath: string;
  manifest: ProviderManifest;
}

/** Install a provider package (folder or file+sibling manifest) into userData. */
export function installProviderFromSource(sourcePath: string): InstallProviderResult {
  if (!existsSync(sourcePath)) {
    throw new Error("Source path does not exist");
  }

  const manifestPath = findManifestPath(sourcePath);
  let manifest: ProviderManifest;
  let packageRoot: string;

  if (manifestPath) {
    manifest = readProviderManifest(manifestPath);
    packageRoot = dirname(manifestPath);
  } else {
    // No manifest yet — scaffold one next to / from the picked file
    const st = statSync(sourcePath);
    packageRoot = st.isDirectory() ? sourcePath : dirname(sourcePath);
    const base = st.isDirectory()
      ? basename(sourcePath)
      : basename(sourcePath, extname(sourcePath));
    const id = base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || `provider-${Date.now().toString(36)}`;
    manifest = {
      id,
      name: base || id,
      version: "0.1.0",
      description: "Uploaded provider package",
      engine: "script",
      hosts: [],
      formats: ["best"],
      main: st.isFile() ? basename(sourcePath) : "index.js",
    };
    const scaffoldPath = join(packageRoot, "pinforge.provider.json");
    writeFileSync(scaffoldPath, JSON.stringify(manifest, null, 2), "utf-8");
  }

  const installDir = join(extensionsRoot(), manifest.id);
  ensureDir(extensionsRoot());
  // Fresh copy
  if (existsSync(installDir)) {
    // overwrite files in place
  } else {
    ensureDir(installDir);
  }
  copyTree(packageRoot, installDir);

  const installedManifest = join(installDir, "pinforge.provider.json");
  if (!existsSync(installedManifest)) {
    writeFileSync(installedManifest, JSON.stringify(manifest, null, 2), "utf-8");
  }
  const finalManifest = readProviderManifest(
    existsSync(installedManifest) ? installedManifest : findManifestPath(installDir)!
  );

  return {
    installDir,
    manifestPath: existsSync(installedManifest)
      ? installedManifest
      : findManifestPath(installDir)!,
    manifest: finalManifest,
  };
}

export function installFormatPlugin(sourcePath: string): FormatPluginConfig {
  if (!existsSync(sourcePath)) throw new Error("Plugin file does not exist");
  ensureDir(formatPluginsRoot());
  const name = basename(sourcePath);
  const id = name
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

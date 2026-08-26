#!/usr/bin/env node

/**
 * Pinforge build coordinator (adapted from AionUi scripts/build-with-builder.js)
 *
 * Flow: electron-vite (apps/desktop) → electron-builder distributables
 *
 * Flags:
 *   --skip-vite     Skip Vite if out/ already exists
 *   --force         Force full Vite rebuild
 *   --pack-only     Skip electron-builder distributables
 *   --skip-native   Set SKIP_NATIVE_REBUILD for afterPack
 *   auto            Detect arch from electron-builder.yml / machine
 *   x64 | arm64     Target architecture
 *   --mac|--win|--linux   Passed through to electron-builder
 */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DESKTOP = path.join(ROOT, "apps", "desktop");
const OUT_DIR = path.join(DESKTOP, "out");
const RELEASE_DIR = path.join(DESKTOP, "release");
const BUILDER_CONFIG = path.join(DESKTOP, "electron-builder.yml");
const INCREMENTAL_CACHE_FILE = path.join(OUT_DIR, ".build-hash");

const DMG_RETRY_MAX = 3;
const DMG_RETRY_DELAY_SEC = 30;

function run(cmd, opts = {}) {
  execSync(cmd, {
    stdio: "inherit",
    shell: true,
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...opts.env },
  });
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "out" ||
        entry.name === "release" ||
        entry.name === ".git"
      ) {
        continue;
      }
      walkFiles(fullPath, acc);
    } else if (entry.isFile()) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function computeSourceHash() {
  const hash = crypto.createHash("md5");
  const filesToHash = [
    "package.json",
    "pnpm-lock.yaml",
    "apps/desktop/package.json",
    "apps/desktop/electron.vite.config.ts",
    "apps/desktop/electron-builder.yml",
  ];

  for (const file of filesToHash) {
    const filePath = path.join(ROOT, file);
    if (fs.existsSync(filePath)) {
      hash.update(file + ":");
      hash.update(fs.readFileSync(filePath));
    }
  }

  for (const dir of ["apps/desktop/src", "packages/core/src", "scripts"]) {
    const dirPath = path.join(ROOT, dir);
    if (!fs.existsSync(dirPath)) continue;
    const files = walkFiles(dirPath)
      .map((file) => path.relative(ROOT, file).replace(/\\/g, "/"))
      .sort();
    for (const relPath of files) {
      const absolutePath = path.join(ROOT, relPath);
      const stat = fs.statSync(absolutePath);
      hash.update(relPath + ":");
      hash.update(String(stat.size));
      hash.update(String(stat.mtimeMs));
    }
  }

  return hash.digest("hex");
}

function loadCachedHash() {
  try {
    if (fs.existsSync(INCREMENTAL_CACHE_FILE)) {
      return fs.readFileSync(INCREMENTAL_CACHE_FILE, "utf8").trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveCurrentHash(hash) {
  try {
    fs.mkdirSync(path.dirname(INCREMENTAL_CACHE_FILE), { recursive: true });
    fs.writeFileSync(INCREMENTAL_CACHE_FILE, hash);
  } catch {
    /* ignore */
  }
}

function collectHtmlAssetRefs(html, htmlDirRelative) {
  const refs = [];
  const attrRe = /\b(?:src|href)=["']([^"']+)["']/g;
  for (const match of html.matchAll(attrRe)) {
    const rawRef = match[1];
    if (
      !rawRef ||
      rawRef.startsWith("http:") ||
      rawRef.startsWith("https:") ||
      rawRef.startsWith("data:")
    )
      continue;
    if (!rawRef.startsWith("./") && !rawRef.startsWith("../")) continue;
    const normalized = path
      .normalize(path.join(htmlDirRelative, rawRef.split(/[?#]/)[0]))
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
    if (normalized.startsWith("assets/")) refs.push(normalized);
  }
  return refs;
}

function walkHtmlFiles(dir, baseDir = dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(fullPath, baseDir, acc);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      acc.push({
        fullPath,
        relativePath: path.relative(baseDir, fullPath).replace(/\\/g, "/"),
      });
    }
  }
  return acc;
}

function validateRendererBuildOutput(rendererDir) {
  const problems = [];
  const indexHtmlPath = path.join(rendererDir, "index.html");
  if (!fs.existsSync(indexHtmlPath)) {
    return {
      valid: false,
      problems: ["Renderer build output is incomplete: missing out/renderer/index.html"],
    };
  }

  const htmlFiles = walkHtmlFiles(rendererDir);
  const assetRefs = new Set();
  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile.fullPath, "utf8");
    if (/src=["'][^"']*\.tsx(?:[?#][^"']*)?["']/.test(html)) {
      problems.push(
        `Renderer build output is incomplete: ${htmlFile.relativePath} still references TypeScript source`
      );
    }
    const htmlDirRelative = path.dirname(htmlFile.relativePath);
    const baseRelative = htmlDirRelative === "." ? "" : htmlDirRelative;
    for (const ref of collectHtmlAssetRefs(html, baseRelative)) {
      assetRefs.add(ref);
    }
  }

  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
  if (!/<div\s+id=["']root["']/.test(indexHtml)) {
    problems.push("Renderer build output is incomplete: index.html is missing #root");
  }
  if (
    !/<script\b[^>]*type=["']module["'][^>]*\bsrc=["']\.\/assets\/[^"']+\.js["']/.test(indexHtml)
  ) {
    problems.push("Renderer build output is incomplete: index.html has no bundled module script");
  }
  if (assetRefs.size === 0) {
    problems.push(
      "Renderer build output is incomplete: no bundled renderer asset references found"
    );
  }
  for (const ref of [...assetRefs].sort()) {
    if (!fs.existsSync(path.join(rendererDir, ref))) {
      problems.push(`Renderer build output is incomplete: missing referenced asset ${ref}`);
    }
  }

  return { valid: problems.length === 0, problems };
}

function validateViteBuildOutput() {
  const problems = [];
  for (const relPath of ["main/index.js", "preload/index.js"]) {
    if (!fs.existsSync(path.join(OUT_DIR, relPath))) {
      problems.push(`Vite build output is incomplete: missing out/${relPath}`);
    }
  }
  const rendererValidation = validateRendererBuildOutput(path.join(OUT_DIR, "renderer"));
  problems.push(...rendererValidation.problems);
  return { valid: problems.length === 0, problems };
}

function viteBuildExists() {
  return (
    fs.existsSync(path.join(OUT_DIR, "main", "index.js")) &&
    fs.existsSync(path.join(OUT_DIR, "preload", "index.js")) &&
    validateRendererBuildOutput(path.join(OUT_DIR, "renderer")).valid
  );
}

function shouldSkipViteBuild(skipViteFlag, forceFlag) {
  if (forceFlag) return false;
  if (skipViteFlag) return true;

  const currentHash = computeSourceHash();
  const cachedHash = loadCachedHash();
  if (cachedHash && currentHash === cachedHash && viteBuildExists()) {
    console.log("📦 Incremental build: Vite output unchanged, skipping compilation");
    return true;
  }
  return false;
}

function cleanupDiskImages() {
  try {
    const result = spawnSync(
      "sh",
      [
        "-c",
        "hdiutil info 2>/dev/null | grep /dev/disk | awk '{print $1}' | xargs -I {} hdiutil detach {} -force 2>/dev/null",
      ],
      { stdio: "ignore" }
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

function findAppDir(releaseDir) {
  const candidates = ["mac", "mac-arm64", "mac-x64", "mac-universal"];
  for (const dir of candidates) {
    const fullPath = path.join(releaseDir, dir);
    if (fs.existsSync(fullPath)) {
      const hasApp = fs.readdirSync(fullPath).some((f) => f.endsWith(".app"));
      if (hasApp) return fullPath;
    }
  }
  return null;
}

function dmgExists(releaseDir) {
  try {
    return fs.readdirSync(releaseDir).some((f) => f.endsWith(".dmg"));
  } catch {
    return false;
  }
}

function tryRemoveDir(targetDir) {
  if (!fs.existsSync(targetDir)) return true;
  try {
    fs.rmSync(targetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    return true;
  } catch (error) {
    console.log(`❌ Failed to remove ${targetDir}: ${error.message}`);
    return false;
  }
}

function isProcessRunningWindows(imageName) {
  if (process.platform !== "win32") return false;
  try {
    const result = execSync(`tasklist /FI "IMAGENAME eq ${imageName}"`, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return result.toString().toLowerCase().includes(imageName.toLowerCase());
  } catch {
    return false;
  }
}

function killWindowsProcesses(imageNames) {
  if (process.platform !== "win32") return;
  for (const name of imageNames) {
    try {
      execSync(`taskkill /F /IM ${name}`, { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }
}

function cleanupWindowsPackOutput() {
  if (!fs.existsSync(RELEASE_DIR)) return;
  const removed = [];
  const winUnpackedDirRe = /^win(?:-[a-z0-9]+)?-unpacked$/i;
  const winArtifactFileRe = /-Setup\.(?:exe|msi)$/i;

  for (const entry of fs.readdirSync(RELEASE_DIR, { withFileTypes: true })) {
    const fullPath = path.join(RELEASE_DIR, entry.name);
    if (entry.isDirectory() && winUnpackedDirRe.test(entry.name)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      removed.push(entry.name);
    } else if (
      entry.isFile() &&
      (winArtifactFileRe.test(entry.name) || entry.name.endsWith(".exe"))
    ) {
      // keep blockmaps; remove stale installers matching product
      if (entry.name.startsWith("Pinforge") || winArtifactFileRe.test(entry.name)) {
        fs.rmSync(fullPath, { force: true });
        removed.push(entry.name);
      }
    }
  }

  if (removed.length > 0) {
    console.log(`🧹 Cleaned stale Windows outputs: ${removed.join(", ")}`);
  }
}

function getTargetArchFromConfig(platform) {
  try {
    const content = fs.readFileSync(BUILDER_CONFIG, "utf8");
    const platformRegex = new RegExp(`^${platform}:\\s*$`, "m");
    const platformMatch = content.match(platformRegex);
    if (!platformMatch) return null;

    const platformStartIndex = platformMatch.index;
    const afterPlatform = content.slice(platformStartIndex + platformMatch[0].length);
    const nextPlatformMatch = afterPlatform.match(/^[a-zA-Z][a-zA-Z0-9]*:/m);
    const platformBlock = nextPlatformMatch
      ? content.slice(
          platformStartIndex,
          platformStartIndex + platformMatch[0].length + nextPlatformMatch.index
        )
      : content.slice(platformStartIndex);

    const archMatch = platformBlock.match(/arch:\s*\[\s*([a-z0-9_]+)/i);
    return archMatch ? archMatch[1].trim() : null;
  } catch {
    return null;
  }
}

function createMacArtifactsWithPrepackaged(appDir, targetArch) {
  const appName = fs.readdirSync(appDir).find((f) => f.endsWith(".app"));
  if (!appName) throw new Error(`No .app found in ${appDir}`);
  const appPath = path.join(appDir, appName);

  run(
    `pnpm exec electron-builder --projectDir "${DESKTOP}" --config electron-builder.yml --mac dmg zip --${targetArch} --prepackaged "${appPath}" --publish=never`,
    { cwd: DESKTOP }
  );
}

function buildWithDmgRetry(cmd, targetArch) {
  const isMac = process.platform === "darwin";

  try {
    run(cmd, { cwd: DESKTOP });
    return;
  } catch (error) {
    const appDir = isMac ? findAppDir(RELEASE_DIR) : null;
    if (!appDir || dmgExists(RELEASE_DIR)) throw error;

    console.log("\n🔄 Build failed during DMG creation (.app exists, .dmg missing)");
    console.log("   Retrying macOS distributable creation with --prepackaged...");

    for (let attempt = 1; attempt <= DMG_RETRY_MAX; attempt++) {
      cleanupDiskImages();
      spawnSync("sleep", [String(DMG_RETRY_DELAY_SEC)]);
      try {
        console.log(`\n📀 DMG retry attempt ${attempt}/${DMG_RETRY_MAX}...`);
        createMacArtifactsWithPrepackaged(appDir, targetArch);
        console.log("✅ macOS distributables created successfully on retry");
        return;
      } catch (retryError) {
        console.log(`   ⚠️  DMG retry ${attempt}/${DMG_RETRY_MAX} failed`);
        cleanupDiskImages();
        if (attempt === DMG_RETRY_MAX) throw retryError;
      }
    }
  }
}

// --- CLI ---

const args = process.argv.slice(2);
const archList = ["x64", "arm64", "ia32", "armv7l"];
const skipVite = args.includes("--skip-vite");
const skipNative = args.includes("--skip-native");
const packOnly = args.includes("--pack-only");
const forceBuild = args.includes("--force");

const builderArgs = args
  .filter((arg) => {
    if (arg === "auto") return false;
    if (
      arg === "--skip-vite" ||
      arg === "--skip-native" ||
      arg === "--pack-only" ||
      arg === "--force"
    )
      return false;
    if (archList.includes(arg)) return false;
    if (arg.startsWith("--") && archList.includes(arg.slice(2))) return false;
    return true;
  })
  .join(" ");

const rawArchArgs = args
  .filter(
    (arg) => archList.includes(arg) || (arg.startsWith("--") && archList.includes(arg.slice(2)))
  )
  .map((arg) => (arg.startsWith("--") ? arg.slice(2) : arg));
const archArgs = [...new Set(rawArchArgs)];

const buildMachineArch = process.arch;
let targetArch;
let multiArch = false;

if (archArgs.length > 1) {
  multiArch = true;
  targetArch = archArgs[0];
  console.log(`🔨 Multi-architecture build detected: ${archArgs.join(", ")}`);
} else if (args[0] === "auto") {
  if (archArgs.length === 1) {
    targetArch = archArgs[0];
  } else {
    let detectedPlatform = null;
    if (builderArgs.includes("--linux")) detectedPlatform = "linux";
    else if (builderArgs.includes("--mac")) detectedPlatform = "mac";
    else if (builderArgs.includes("--win")) detectedPlatform = "win";
    const configArch = detectedPlatform ? getTargetArchFromConfig(detectedPlatform) : null;
    targetArch = configArch || buildMachineArch;
  }
} else {
  targetArch = archArgs[0] || buildMachineArch;
}

console.log(`🔨 Building for architecture: ${targetArch}`);
console.log(`📋 Builder arguments: ${builderArgs || "(none)"}`);
if (skipVite) console.log("⚡ --skip-vite: Will skip Vite compilation if output exists");
if (skipNative) console.log("⚡ --skip-native: Will skip native module rebuilding");
if (packOnly) console.log("⚡ --pack-only: Will skip electron-builder distributable creation");
if (forceBuild) console.log("⚡ --force: Force full rebuild");

try {
  // Ensure package.json main points at electron-vite output
  const packageJsonPath = path.join(DESKTOP, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (packageJson.main !== "./out/main/index.js") {
    packageJson.main = "./out/main/index.js";
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
  }

  const skipViteBuild = shouldSkipViteBuild(skipVite, forceBuild);
  if (!skipViteBuild) {
    console.log(`📦 Building ${targetArch} with electron-vite...`);
    run(`pnpm exec electron-vite build`, {
      cwd: DESKTOP,
      env: { ELECTRON_BUILDER_ARCH: targetArch },
    });
    saveCurrentHash(computeSourceHash());
  } else {
    console.log("📦 Using cached Vite build output");
  }

  console.log("🦀 Building Rust pinforge-server…");
  run(`node "${path.join(ROOT, "scripts", "build-rust-server.js")}"`);

  const viteOutputValidation = validateViteBuildOutput();
  if (!viteOutputValidation.valid) {
    throw new Error(
      `Vite build output is incomplete:\n${viteOutputValidation.problems.join("\n")}`
    );
  }

  if (packOnly) {
    console.log("✅ Package completed! (skipped distributable creation)");
    return;
  }

  const isCI = process.env.CI === "true";
  if (!process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL) {
    process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL = isCI ? "9" : "7";
  }
  console.log(
    `📦 Compression level: ${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL} (${isCI ? "CI build" : "local build"})`
  );

  if (skipNative) {
    process.env.SKIP_NATIVE_REBUILD = "true";
  }

  let archFlag = "";
  if (multiArch) {
    archFlag = archArgs.map((arch) => `--${arch}`).join(" ");
    console.log(`🚀 Packaging for multiple architectures: ${archArgs.join(", ")}...`);
  } else {
    archFlag = `--${targetArch}`;
    console.log(`🚀 Creating distributables for ${targetArch}...`);
  }

  const isWindowsBuild = builderArgs.includes("--win") || builderArgs.includes("--all");
  if (process.platform === "win32" && isWindowsBuild) {
    const winUnpackedDir = path.join(RELEASE_DIR, "win-unpacked");
    let cleaned = tryRemoveDir(winUnpackedDir);
    if (!cleaned) {
      if (isProcessRunningWindows("Pinforge.exe") || isProcessRunningWindows("electron.exe")) {
        console.log("⚠️  Detected running Pinforge/Electron process. Attempting to close...");
        killWindowsProcesses(["Pinforge.exe", "electron.exe"]);
        cleaned = tryRemoveDir(winUnpackedDir);
        if (!cleaned) {
          console.log("⚠️  Directory still locked. Close Pinforge/Electron and retry.");
        }
      }
    }
    cleanupWindowsPackOutput();
  }

  const builderCommand = `pnpm exec electron-builder --config electron-builder.yml ${builderArgs} ${archFlag} --publish=never`;
  try {
    buildWithDmgRetry(builderCommand, targetArch);
  } catch (error) {
    const winExePath = path.join(RELEASE_DIR, "win-unpacked", "Pinforge.exe");
    const canRetryWithoutExecutableEdit =
      process.platform === "win32" &&
      isWindowsBuild &&
      process.env.CI !== "true" &&
      fs.existsSync(winExePath);

    if (!canRetryWithoutExecutableEdit) throw error;

    console.log("⚠️  Windows local build failed after Pinforge.exe was produced.");
    console.log("   Retrying with win.signAndEditExecutable=false...");
    killWindowsProcesses(["Pinforge.exe", "electron.exe"]);
    cleanupWindowsPackOutput();
    buildWithDmgRetry(`${builderCommand} --config.win.signAndEditExecutable=false`, targetArch);
  }

  console.log("✅ Build completed!");
  console.log(`   Artifacts: ${RELEASE_DIR}`);
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exitCode = 1;
}

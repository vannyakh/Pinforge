/**
 * Unified native module rebuild utility for Pinforge.
 * Adapted from AionUi scripts/rebuildNativeModules.js — targets `sharp` (N-API).
 */

const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function normalizeArch(arch) {
  const archMap = {
    x64: "x64",
    arm64: "arm64",
    ia32: "ia32",
    armv7l: "arm",
  };
  return archMap[arch] || arch;
}

/** Modules that must match the packaged Electron ABI / platform. */
function getModulesToRebuild(_platform) {
  return ["sharp"];
}

function getPnpmExec() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function buildEnvironment(platform, targetArch, electronVersion) {
  const env = {
    ...process.env,
    npm_config_arch: targetArch,
    npm_config_target_arch: targetArch,
    npm_config_build_from_source: "true",
    npm_config_runtime: "electron",
    npm_config_disturl: "https://electronjs.org/headers",
    npm_config_target: electronVersion,
  };

  if (platform === "win32" || platform === "windows") {
    env.MSVS_VERSION = "2022";
    env.GYP_MSVS_VERSION = "2022";
    env.WindowsTargetPlatformVersion = "10.0.19041.0";
    env._WIN32_WINNT = "0x0A00";
  }

  return env;
}

function canCrossCompileFromSource(buildArch, targetArch, platform) {
  if (platform === "darwin") return true;
  if (platform === "win32" && buildArch === "x64" && targetArch === "arm64") return true;
  return buildArch === targetArch;
}

function rebuildWithElectronRebuild(options) {
  const {
    platform,
    arch,
    electronVersion,
    cwd = path.resolve(__dirname, "..", "apps", "desktop"),
    modules = getModulesToRebuild(platform),
  } = options;

  const targetArch = normalizeArch(arch);
  const env = buildEnvironment(platform, targetArch, electronVersion);
  const pnpm = getPnpmExec();
  const rebuildCmd = `${pnpm} exec electron-rebuild --only ${modules.join(",")} --force --arch ${targetArch} --electron-version ${electronVersion}`;

  execSync(rebuildCmd, {
    stdio: "inherit",
    cwd,
    env,
    shell: true,
  });
}

function findNodeFiles(dir, maxDepth = 4, currentDepth = 0) {
  if (currentDepth >= maxDepth || !fs.existsSync(dir)) return [];

  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findNodeFiles(fullPath, maxDepth, currentDepth + 1));
      } else if (entry.isFile() && entry.name.endsWith(".node")) {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore permission errors
  }
  return results;
}

function verifyModuleBinary(moduleRoot, moduleName) {
  if (moduleName === "sharp") {
    // Prefer platform packages under @img next to sharp when present
    const parent = path.dirname(moduleRoot);
    const imgDir = path.join(parent, "@img");
    const searchRoots = [moduleRoot];
    if (fs.existsSync(imgDir)) searchRoots.push(imgDir);

    for (const root of searchRoots) {
      const found = findNodeFiles(root);
      if (found.length > 0) {
        found.forEach((f) => console.log(`     Debug: Found binary at ${f}`));
        return true;
      }
    }
    console.log(`     Debug: No .node files found for sharp under ${moduleRoot}`);
    return false;
  }

  const found = findNodeFiles(moduleRoot);
  if (found.length > 0) {
    found.forEach((f) => console.log(`     Debug: Found binary at ${f}`));
    return true;
  }
  console.log(`     Debug: No .node files found in ${moduleRoot}`);
  return false;
}

/**
 * Rebuild a single module via prebuild-install, falling back to electron-rebuild.
 */
function rebuildSingleModule(options) {
  const {
    moduleName,
    moduleRoot,
    platform,
    arch,
    electronVersion,
    projectRoot = path.resolve(__dirname, "..", "apps", "desktop"),
    forceRebuild = false,
    buildArch = process.arch,
  } = options;

  const targetArch = normalizeArch(arch);
  const normalizedBuildArch = normalizeArch(buildArch);
  const isCrossCompile = normalizedBuildArch !== targetArch;
  const env = buildEnvironment(platform, targetArch, electronVersion);
  env.npm_config_platform = platform;
  env.npm_config_target_platform = platform;

  const pnpm = getPnpmExec();
  const mustUsePrebuild = platform === "linux" && isCrossCompile;

  if (mustUsePrebuild) {
    console.log(`     Linux cross-compilation detected (${normalizedBuildArch} → ${targetArch})`);
  }

  if (!forceRebuild || mustUsePrebuild) {
    try {
      env.npm_config_build_from_source = "false";
      // sharp installs platform binaries via optional @img/* packages; prebuild-install
      // still helps when a .node is missing after unpack.
      const args = [
        "exec",
        "prebuild-install",
        "--runtime=electron",
        `--target=${electronVersion}`,
        `--platform=${platform}`,
        `--arch=${targetArch}`,
        "--force",
      ];
      console.log(`     Running: ${pnpm} ${args.join(" ")}`);
      execFileSync(pnpm, args, {
        cwd: moduleRoot,
        env,
        stdio: "inherit",
        shell: true,
      });
      console.log(`     ✓ prebuild-install succeeded`);
      return true;
    } catch (error) {
      if (mustUsePrebuild) {
        console.error(
          `     ✗ prebuild-install failed and cross-compilation from source not supported`
        );
        console.error(`     Error: ${error.message}`);
        return false;
      }
      console.log(`     prebuild-install failed, falling back to electron-rebuild...`);
    }
  }

  if (!canCrossCompileFromSource(normalizedBuildArch, targetArch, platform)) {
    console.error(
      `     ✗ Cross-compilation from ${normalizedBuildArch} to ${targetArch} not supported on ${platform}`
    );
    return false;
  }

  try {
    env.npm_config_build_from_source = "true";
    const args = [
      "exec",
      "electron-rebuild",
      "--only",
      moduleName,
      "--force",
      `--platform=${platform}`,
      `--arch=${targetArch}`,
    ];
    console.log(`     Running: ${pnpm} ${args.join(" ")}`);
    execFileSync(pnpm, args, {
      cwd: projectRoot,
      env,
      stdio: "inherit",
      shell: true,
    });
    return true;
  } catch (error) {
    console.error(`❌ Failed to rebuild ${moduleName}:`, error.message);
    return false;
  }
}

module.exports = {
  normalizeArch,
  getModulesToRebuild,
  buildEnvironment,
  rebuildWithElectronRebuild,
  rebuildSingleModule,
  verifyModuleBinary,
  canCrossCompileFromSource,
  getPnpmExec,
};

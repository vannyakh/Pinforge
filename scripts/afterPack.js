const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  normalizeArch,
  rebuildSingleModule,
  verifyModuleBinary,
  getModulesToRebuild,
} = require("./rebuildNativeModules");

/**
 * afterPack hook for electron-builder
 * Rebuilds / verifies native modules (sharp) for cross-arch and Windows packs.
 */

/** electron-builder may pass arch as Arch enum number or string */
function resolveArch(arch) {
  if (typeof arch === "string") return normalizeArch(arch);
  // Arch enum from builder-util: ia32=0, x64=1, armv7l=2, arm64=3, universal=4
  const byNumber = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64" };
  return normalizeArch(byNumber[arch] || process.arch);
}

function resolveResourcesDir(electronPlatformName, appOutDir, packager) {
  if (electronPlatformName !== "darwin") return path.join(appOutDir, "resources");

  const appName = packager?.appInfo?.productFilename || "Pinforge";
  return path.join(appOutDir, `${appName}.app`, "Contents", "Resources");
}

module.exports = async function afterPack(context) {
  const { arch, electronPlatformName, appOutDir, packager } = context;
  const targetArch = resolveArch(arch);
  const buildArch = normalizeArch(os.arch());

  console.log(`\n🔧 afterPack hook started`);
  console.log(
    `   Platform: ${electronPlatformName}, Build arch: ${buildArch}, Target arch: ${targetArch}`
  );

  const isCrossCompile = buildArch !== targetArch;
  const forceRebuild = process.env.FORCE_NATIVE_REBUILD === "true";
  const skipNative = process.env.SKIP_NATIVE_REBUILD === "true";
  // Windows: rebuild so Electron ABI / path layout matches packaged app
  const needsSameArchRebuild = electronPlatformName === "win32";

  if (skipNative) {
    console.log(`   ✓ SKIP_NATIVE_REBUILD=true — skipping native rebuild\n`);
    return;
  }

  const resourcesDir = resolveResourcesDir(electronPlatformName, appOutDir, packager);
  console.log(`   Checking resources directory: ${resourcesDir}`);

  if (!fs.existsSync(resourcesDir)) {
    throw new Error(`resources directory not found: ${resourcesDir}`);
  }

  const unpackedDir = path.join(resourcesDir, "app.asar.unpacked");
  if (!fs.existsSync(unpackedDir)) {
    console.warn(`   ⚠️  app.asar.unpacked not found — sharp may be missing from asarUnpack`);
  }

  if (!isCrossCompile && !needsSameArchRebuild && !forceRebuild) {
    console.log(
      `   ✓ Same architecture, rebuild skipped (set FORCE_NATIVE_REBUILD=true to override)\n`
    );
    return;
  }

  if (isCrossCompile) {
    console.log(
      `   ⚠️  Cross-compilation detected (${buildArch} → ${targetArch}), will rebuild native modules`
    );
  } else {
    console.log(
      `   ℹ️  Rebuilding native modules for platform requirements (force=${forceRebuild})`
    );
  }

  const electronVersion =
    packager?.info?.electronVersion ??
    packager?.config?.electronVersion ??
    require("../apps/desktop/package.json").devDependencies?.electron?.replace(/^\D*/, "");

  const nodeModulesDir = path.join(resourcesDir, "app.asar.unpacked", "node_modules");
  const modulesToRebuild = getModulesToRebuild(electronPlatformName);
  console.log(`   Modules to rebuild: ${modulesToRebuild.join(", ")}`);

  if (isCrossCompile && fs.existsSync(nodeModulesDir)) {
    console.log(`\n🧹 Cleaning wrong-architecture build artifacts...`);
    for (const moduleName of modulesToRebuild) {
      const moduleRoot = path.join(nodeModulesDir, moduleName);
      if (!fs.existsSync(moduleRoot)) continue;
      for (const dirName of ["build", "bin"]) {
        const dir = path.join(moduleRoot, dirName);
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(`   ✓ Removed ${moduleName}/${dirName}/`);
        }
      }
    }

    const wrongArchSuffix = targetArch === "arm64" ? "x64" : "arm64";
    console.log(`\n🧹 Removing ${wrongArchSuffix}-specific optional dependencies...`);
    for (const module of fs.readdirSync(nodeModulesDir)) {
      const modulePath = path.join(nodeModulesDir, module);
      if (module.startsWith("@") && fs.statSync(modulePath).isDirectory()) {
        for (const pkg of fs.readdirSync(modulePath)) {
          if (
            pkg.includes(`-${wrongArchSuffix}`) ||
            pkg.includes(`-${electronPlatformName}-${wrongArchSuffix}`)
          ) {
            fs.rmSync(path.join(modulePath, pkg), { recursive: true, force: true });
            console.log(`   ✓ Removed ${module}/${pkg}`);
          }
        }
      } else if (
        module.includes(`-${wrongArchSuffix}`) ||
        module.includes(`-${electronPlatformName}-${wrongArchSuffix}`)
      ) {
        if (fs.statSync(modulePath).isDirectory()) {
          fs.rmSync(modulePath, { recursive: true, force: true });
          console.log(`   ✓ Removed ${module}`);
        }
      }
    }
  }

  const failedModules = [];
  const desktopRoot = path.resolve(__dirname, "..", "apps", "desktop");

  for (const moduleName of modulesToRebuild) {
    const moduleRoot = path.join(nodeModulesDir, moduleName);
    if (!fs.existsSync(moduleRoot)) {
      console.warn(`   ⚠️  ${moduleName} not found in app.asar.unpacked, skipping`);
      continue;
    }

    console.log(`   ✓ Found ${moduleName}, rebuilding for ${targetArch}...`);
    const success = rebuildSingleModule({
      moduleName,
      moduleRoot,
      platform: electronPlatformName,
      arch: targetArch,
      electronVersion,
      projectRoot: desktopRoot,
      buildArch,
      forceRebuild: false,
    });

    if (!success) {
      failedModules.push(moduleName);
      continue;
    }

    if (!verifyModuleBinary(moduleRoot, moduleName)) {
      console.error(`     ✗ Binary verification failed`);
      failedModules.push(moduleName);
    } else {
      console.log(`     ✓ Binary verification passed`);
    }
  }

  if (failedModules.length > 0) {
    // sharp often works via @img prebuilds without electron-rebuild; warn hard but
    // only fail when FORCE_NATIVE_REBUILD is set.
    const message = `Failed to rebuild modules for ${electronPlatformName}-${targetArch}: ${failedModules.join(", ")}`;
    if (forceRebuild) {
      throw new Error(message);
    }
    console.warn(`   ⚠️  ${message}`);
    console.warn(`   Continuing — sharp N-API binaries may already be present under @img/*`);
  } else {
    console.log(`✅ Native module check complete for ${targetArch}\n`);
  }
};

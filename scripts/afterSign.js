const { execSync } = require("child_process");

/**
 * macOS afterSign hook — notarize when Apple credentials are present.
 * Adapted from AionUi scripts/afterSign.js
 */
exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== "darwin") {
    return;
  }

  let notarize;
  try {
    ({ notarize } = await import("@electron/notarize"));
  } catch {
    console.log("Skipping notarization - @electron/notarize is not installed");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appBundleId = context.packager.appInfo.id;
  const appPath = `${appOutDir}/${appName}.app`;

  try {
    execSync(`codesign --verify --verbose "${appPath}"`, { stdio: "pipe" });
    console.log(`App ${appName} is properly code signed`);
  } catch {
    console.log(`App ${appName} is not code signed, applying ad-hoc signature...`);
    try {
      execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: "inherit" });
      console.log(`Ad-hoc signature applied successfully to ${appName}`);
    } catch (adHocError) {
      console.error("Ad-hoc signing failed:", adHocError.message);
    }
    return;
  }

  if (!process.env.appleId || !process.env.appleIdPassword) {
    console.log("Skipping notarization - missing Apple ID credentials");
    return;
  }

  console.log(`Starting notarization for ${appName} (${appBundleId})...`);

  try {
    await notarize({
      tool: "notarytool",
      appBundleId,
      appPath,
      appleId: process.env.appleId,
      appleIdPassword: process.env.appleIdPassword,
      teamId: process.env.teamId,
    });
    console.log("Notarization completed successfully");
  } catch (error) {
    console.error("Notarization failed:", error);
    throw error;
  }
};

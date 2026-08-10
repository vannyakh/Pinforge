import { defineConfig } from "@playwright/test";

/**
 * Pinforge desktop e2e (Playwright).
 * Specs live in tests/e2e as *.e2e.ts files.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Electron tests share one app instance
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Must be 1: tests share a singleton Electron app instance
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "tests/e2e/report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "tests/e2e/report" }]],
  use: {
    trace: process.env.E2E_TRACE === "1" ? "retain-on-failure" : "on-first-retry",
    // screenshot/video can be handled by a custom Electron fixture later
    screenshot: "only-on-failure",
    video: process.env.E2E_TRACE === "1" ? "retain-on-failure" : "on-first-retry",
  },
  outputDir: "tests/e2e/results",
});

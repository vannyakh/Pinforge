import { test, expect } from "@playwright/test";

/**
 * Placeholder Electron e2e entry.
 * Real window/UI cases should use a shared `_electron` fixture (see playwright.config.ts).
 */
test.describe("Pinforge desktop smoke", () => {
  test("e2e harness is configured", async () => {
    expect(test.info().project.testDir).toContain("e2e");
  });
});

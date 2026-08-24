import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBoard } from "../../src/sites/pinterest/resolveBoard/index.ts";

const LIVE = process.env.PINTEREST_LIVE === "1";

describe("resolveBoard live", { skip: !LIVE }, () => {
  it("resolves pins from a public board URL", async () => {
    const result = await resolveBoard(
      "https://www.pinterest.com/soriyavan66/cattle-feeding-farm-life-shorts/",
      { maxPins: 10 }
    );
    assert.equal(result.kind, "board");
    assert.ok(result.pinUrls.length > 0, "expected at least one pin URL");
    assert.match(result.pinUrls[0]!, /\/pin\/\d+\//);
  });
});

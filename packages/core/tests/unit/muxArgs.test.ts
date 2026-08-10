import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { muxAvCopyArgs, muxAvRemuxArgs } from "../../src/providers/youtube/muxArgs.ts";

describe("muxAvCopyArgs", () => {
  it("uses stream copy with faststart", () => {
    const args = muxAvCopyArgs("v.mp4", "a.m4a", "out.mp4");
    assert.ok(args.includes("-c"));
    assert.ok(args.includes("copy"));
    assert.ok(args.includes("-movflags"));
    assert.ok(args.includes("+faststart"));
    assert.equal(args.at(-1), "out.mp4");
  });
});

describe("muxAvRemuxArgs", () => {
  it("re-encodes audio to aac on retry path", () => {
    const args = muxAvRemuxArgs("v.webm", "a.opus", "out.mp4");
    assert.ok(args.includes("-c:v"));
    assert.ok(args.includes("-c:a"));
    assert.ok(args.includes("aac"));
    assert.ok(args.includes("+faststart"));
  });
});

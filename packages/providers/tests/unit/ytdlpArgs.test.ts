import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildYtdlpDownloadArgs,
  buildYtdlpProbeArgs,
  ytdlpFormatSelector,
} from "../../src/sites/ytdlp/args.ts";
import { isHttpUrl } from "@pinforge/common";

describe("isHttpUrl", () => {
  it("accepts http(s) and rejects others", () => {
    assert.equal(isHttpUrl("https://example.com/v"), true);
    assert.equal(isHttpUrl("http://example.com/v"), true);
    assert.equal(isHttpUrl("ftp://example.com/v"), false);
    assert.equal(isHttpUrl("not a url"), false);
  });
});

describe("ytdlpFormatSelector", () => {
  it("builds audio-only and height-capped selectors", () => {
    assert.equal(ytdlpFormatSelector({ format: "audio-only" }), "ba/b");
    assert.match(ytdlpFormatSelector({ format: "best", quality: "1080" }), /height<=1080/);
    // mp4 prefers mergeable A/V — not progressive [ext=mp4] first (breaks Bilibili DASH)
    const mp4 = ytdlpFormatSelector({ format: "mp4" });
    assert.match(mp4, /bv\*/);
    assert.match(mp4, /\+ba/);
    assert.doesNotMatch(mp4, /^bv\*\[ext=mp4\]/);
  });
});

describe("buildYtdlpDownloadArgs", () => {
  it("includes format, output template, and ffmpeg location", () => {
    const args = buildYtdlpDownloadArgs({
      url: "https://vimeo.com/123",
      outTemplate: "/tmp/out.%(ext)s",
      format: "best",
      quality: "720",
      ffmpegPath: "/usr/bin/ffmpeg",
    });
    assert.ok(args.includes("https://vimeo.com/123"));
    assert.ok(args.includes("--no-playlist"));
    assert.ok(args.includes("-f"));
    assert.ok(args.includes("--ffmpeg-location"));
    assert.ok(args.includes("/usr/bin/ffmpeg"));
    assert.ok(args.includes("after_move:filepath"));
  });

  it("adds audio extract flags for audio-only", () => {
    const args = buildYtdlpDownloadArgs({
      url: "https://example.com/a",
      outTemplate: "o.%(ext)s",
      format: "audio-only",
    });
    assert.ok(args.includes("-x"));
    assert.ok(args.includes("--audio-format"));
  });
});

describe("buildYtdlpProbeArgs", () => {
  it("requests JSON without downloading", () => {
    const args = buildYtdlpProbeArgs("https://example.com/x");
    assert.ok(args.includes("-J"));
    assert.ok(args.includes("--skip-download"));
    assert.ok(args.includes("--no-playlist"));
  });
});

import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { resolveYoutubePackDir } from "../../src/sites/youtube/packDir.ts";

const OUT = path.join(path.sep, "downloads");

describe("resolveYoutubePackDir", () => {
  it("creates a per-video folder when pack folders are enabled", () => {
    assert.equal(
      resolveYoutubePackDir({
        channelDir: OUT,
        title: "142K views · 6K reactions",
        videoId: "abc123xyz01",
      }),
      path.join(OUT, "142K-views-·-6K-reactions-abc123xyz01")
    );
  });

  it("stays flat when pack folders are turned off", () => {
    assert.equal(
      resolveYoutubePackDir({
        packFolders: false,
        channelDir: OUT,
        title: "Demo",
        videoId: "abc123xyz01",
      }),
      OUT
    );
  });

  it("nests under a channel folder when organize-by-channel is on", () => {
    const channelDir = path.join(OUT, "VANNDA---Topic");
    assert.equal(
      resolveYoutubePackDir({
        channelDir,
        title: "Track A",
        videoId: "vid1",
      }),
      path.join(channelDir, "Track-A-vid1")
    );
  });
});

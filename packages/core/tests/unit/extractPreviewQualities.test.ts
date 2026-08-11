import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildYoutubeSingleExtract } from "../../src/preview/index.ts";

describe("buildYoutubeSingleExtract", () => {
  it("exposes preview heights on ExtractPreview.qualities", () => {
    const preview = buildYoutubeSingleExtract(
      {
        sourceUrl: "https://www.youtube.com/watch?v=gCEGWjLS6Yk",
        provider: { id: "youtube", label: "YouTube", live: true },
        mode: "single",
        modeSupported: true,
        formats: ["best", "mp4", "audio-only"],
        supportedModes: ["single", "playlist", "profile"],
      },
      "https://www.youtube.com/watch?v=gCEGWjLS6Yk",
      {
        title: "FAR FROM HOME",
        channel: "VANNSAK",
        thumbnailUrl: "https://example.com/t.jpg",
        durationText: "2:00",
        durationSec: 120,
        qualities: [1080, 720, 480],
      }
    );

    assert.equal(preview.mode, "single");
    assert.deepEqual(preview.qualities, [1080, 720, 480]);
    assert.equal(preview.title, "FAR FROM HOME");
    assert.match(preview.message ?? "", /VANNSAK/);
    assert.match(preview.message ?? "", /up to 1080p/);
  });

  it("omits quality hint when heights are empty", () => {
    const preview = buildYoutubeSingleExtract(
      {
        sourceUrl: "https://www.youtube.com/watch?v=abc",
        provider: { id: "youtube", label: "YouTube", live: true },
        mode: "single",
        modeSupported: true,
        formats: ["best"],
        supportedModes: ["single"],
      },
      "https://www.youtube.com/watch?v=abc",
      { title: "Clip", qualities: [] }
    );
    assert.deepEqual(preview.qualities, []);
    assert.equal(preview.message, "Clip");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fragmentConcurrencyForQuality,
  normalizeStreamFlags,
  pickDashPair,
  pickProgressive,
  qualityCap,
  youtubeQualityChoices,
  type YtStreamFormat,
} from "../../src/providers/youtube/formats.ts";

describe("youtubeQualityChoices", () => {
  it("returns the default ladder when preview heights are empty", () => {
    assert.deepEqual(youtubeQualityChoices(), [
      "best",
      "2160",
      "1440",
      "1080",
      "720",
      "480",
      "360",
    ]);
    assert.deepEqual(youtubeQualityChoices([]), [
      "best",
      "2160",
      "1440",
      "1080",
      "720",
      "480",
      "360",
    ]);
  });

  it("prefers Best plus available preview heights including 4320", () => {
    assert.deepEqual(youtubeQualityChoices([2160, 1080, 720]), ["best", "2160", "1080", "720"]);
    assert.deepEqual(youtubeQualityChoices([4320, 1080]), ["best", "4320", "1080"]);
  });

  it("falls back when heights are unrecognized", () => {
    assert.deepEqual(youtubeQualityChoices([999]), [
      "best",
      "2160",
      "1440",
      "1080",
      "720",
      "480",
      "360",
    ]);
  });
});

describe("fragmentConcurrencyForQuality", () => {
  it("uses override when provided", () => {
    assert.equal(fragmentConcurrencyForQuality("best", 2), 2);
    assert.equal(fragmentConcurrencyForQuality("360", 8), 8);
  });

  it("bumps concurrency for best and 1080p+", () => {
    assert.equal(fragmentConcurrencyForQuality("best"), 6);
    assert.equal(fragmentConcurrencyForQuality("1080"), 6);
    assert.equal(fragmentConcurrencyForQuality("2160"), 6);
    assert.equal(fragmentConcurrencyForQuality("720"), 4);
    assert.equal(fragmentConcurrencyForQuality("360"), 4);
  });
});

describe("normalizeStreamFlags", () => {
  it("infers video/audio from mime when flags are missing", () => {
    const video = normalizeStreamFlags({
      url: "https://example.com/v",
      mime_type: "video/mp4",
      height: 1080,
    });
    assert.equal(video.has_video, true);
    const audio = normalizeStreamFlags({
      url: "https://example.com/a",
      mime_type: "audio/mp4",
    });
    assert.equal(audio.has_audio, true);
    assert.equal(audio.has_video, false);
  });
});

describe("qualityCap / pickers", () => {
  const formats: YtStreamFormat[] = [
    {
      url: "https://example.com/v2160",
      has_video: true,
      has_audio: false,
      height: 2160,
      quality_label: "2160p",
      mime_type: "video/mp4",
      average_bitrate: 20_000_000,
    },
    {
      url: "https://example.com/v1080",
      has_video: true,
      has_audio: false,
      height: 1080,
      quality_label: "1080p",
      mime_type: "video/mp4",
      average_bitrate: 5_000_000,
    },
    {
      url: "https://example.com/a",
      has_video: false,
      has_audio: true,
      mime_type: "audio/mp4",
      average_bitrate: 128_000,
    },
    {
      url: "https://example.com/p720",
      has_video: true,
      has_audio: true,
      height: 720,
      quality_label: "720p",
      mime_type: "video/mp4",
      average_bitrate: 2_000_000,
    },
  ];

  it("caps height for qualityCap", () => {
    assert.equal(qualityCap("best"), null);
    assert.equal(qualityCap("1080"), 1080);
  });

  it("pickDashPair respects height cap", () => {
    const best = pickDashPair(formats, "best", true);
    assert.equal(best?.video.height, 2160);

    const capped = pickDashPair(formats, "1080", true);
    assert.equal(capped?.video.height, 1080);
    assert.ok(capped?.audio.url);
  });

  it("pickProgressive prefers muxed under cap", () => {
    const got = pickProgressive(formats, "720", true);
    assert.equal(got?.height, 720);
    assert.equal(got?.has_audio, true);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBarePinId,
  isPinItHost,
  isPinUrl,
  isPinterestHost,
  isPinterestUrl,
  parsePinInput,
  pinUrlFromId,
} from "../../src/sites/pinterest/shared/urls.ts";
import { pickPinterestVideoUrl } from "../../src/sites/pinterest/shared/video.ts";
import { toGridCoverUrl, toOriginalsUrl } from "../../src/sites/pinterest/shared/pinimg.ts";

describe("pinterest urls", () => {
  it("recognizes pinterest and pin.it hosts", () => {
    assert.equal(isPinterestHost("www.pinterest.com"), true);
    assert.equal(isPinterestHost("id.pinterest.com"), true);
    assert.equal(isPinterestHost("pinterest.co.uk"), true);
    assert.equal(isPinterestHost("pin.it"), true);
    assert.equal(isPinterestHost("www.pin.it"), true);
    assert.equal(isPinItHost("pin.it"), true);
    assert.equal(isPinterestHost("example.com"), false);
  });

  it("parses full pin urls, bare ids, and pin.it shorts", () => {
    assert.deepEqual(parsePinInput("https://www.pinterest.com/pin/123456789012345678/"), {
      kind: "pin",
      pinId: "123456789012345678",
      url: "https://www.pinterest.com/pin/123456789012345678/",
    });
    assert.deepEqual(parsePinInput("123456789012345678"), {
      kind: "id",
      pinId: "123456789012345678",
      url: "https://www.pinterest.com/pin/123456789012345678/",
    });
    assert.deepEqual(parsePinInput("https://pin.it/AbCdEfG"), {
      kind: "short",
      code: "AbCdEfG",
      url: "https://pin.it/AbCdEfG",
    });
    assert.equal(isBarePinId("123456"), true);
    assert.equal(isBarePinId("abc"), false);
    assert.equal(pinUrlFromId("99"), "https://www.pinterest.com/pin/99/");
  });

  it("isPinterestUrl / isPinUrl accept shorts and bare ids", () => {
    assert.equal(isPinterestUrl("https://pin.it/xyz"), true);
    assert.equal(isPinterestUrl("123456789012345678"), true);
    assert.equal(isPinUrl("https://pin.it/xyz"), true);
    assert.equal(isPinUrl("123456789012345678"), true);
    assert.equal(isPinUrl("https://www.pinterest.com/user/board/"), false);
  });

  it("rejects empty and non-pinterest input", () => {
    assert.equal(parsePinInput(""), null);
    assert.equal(parsePinInput("https://example.com/pin/1"), null);
    assert.equal(isPinterestUrl("https://example.com"), false);
  });
});

describe("pinimg helpers", () => {
  it("upgrades sized urls to originals and grid covers", () => {
    assert.match(
      toOriginalsUrl("https://i.pinimg.com/736x/ab/cd/ef/abcd.jpg")!,
      /\/originals\//
    );
    assert.match(
      toGridCoverUrl("https://i.pinimg.com/originals/ab/cd/ef/abcd.jpg")!,
      /\/474x\//
    );
  });
});

describe("pickPinterestVideoUrl", () => {
  it("prefers progressive V_720P over HLS when both exist", () => {
    const url = pickPinterestVideoUrl(
      {
        video_list: {
          V_HLSV3_MOBILE: {
            url: "https://v.pinimg.com/videos/mc/hls/a.m3u8",
            width: 720,
            height: 1280,
          },
          V_720P: {
            url: "https://v.pinimg.com/videos/mc/720p/a.mp4",
            width: 720,
            height: 1280,
          },
        },
      },
      true
    );
    assert.equal(url, "https://v.pinimg.com/videos/mc/720p/a.mp4");
  });

  it("falls back to HLS keys used by story pins when no mp4", () => {
    const url = pickPinterestVideoUrl(
      {
        video_list: {
          V_HLSV4: {
            url: "https://v.pinimg.com/videos/mc/hls/b.m3u8",
            width: 1080,
            height: 1920,
          },
        },
      },
      true
    );
    assert.equal(url, "https://v.pinimg.com/videos/mc/hls/b.m3u8");
  });

  it("skips HLS when allowHls is false", () => {
    const url = pickPinterestVideoUrl(
      {
        video_list: {
          V_HLSV3_MOBILE: {
            url: "https://v.pinimg.com/videos/mc/hls/c.m3u8",
            width: 720,
            height: 1280,
            need_convert: true,
          },
        },
      },
      false
    );
    assert.equal(url, null);
  });

  it("reads desktop storyPin videoDataV2.videoList720P.v720P", () => {
    const url = pickPinterestVideoUrl(
      {
        videoDataV2: {
          videoList720P: {
            v720P: {
              url: "https://v.pinimg.com/videos/mc/720p/story.mp4",
              width: 720,
              height: 1280,
            },
          },
        },
      },
      false
    );
    assert.equal(url, "https://v.pinimg.com/videos/mc/720p/story.mp4");
  });
});

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
import {
  classifyPinterestCollection,
  isPinterestCollectionUrl,
} from "../../src/sites/pinterest/resolveBoard/index.ts";
import {
  isMultiPinShareUrl,
  parseMultiPinShare,
} from "../../src/sites/pinterest/resolveBoard/multiPinShare.ts";
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

describe("classifyPinterestCollection", () => {
  it("does not treat pin.it shorts as profiles or boards", () => {
    assert.equal(classifyPinterestCollection("https://pin.it/2nj3vkiOc"), null);
    assert.equal(classifyPinterestCollection("https://pin.it/7nqAwRRUI"), null);
    assert.equal(isPinterestCollectionUrl("https://pin.it/2nj3vkiOc"), false);
  });

  it("classifies multi-pin-share as a board collection", () => {
    assert.equal(
      classifyPinterestCollection(
        "https://www.pinterest.com/multi-pin-share/6518739802359149495/?invite_code=abc"
      ),
      "board"
    );
    assert.equal(
      isMultiPinShareUrl(
        "https://www.pinterest.com/multi-pin-share/6518739802359149495/?invite_code=abc"
      ),
      true
    );
    assert.deepEqual(
      parseMultiPinShare(
        "https://www.pinterest.com/multi-pin-share/6518739802359149495/?invite_code=abc&sender=1"
      ),
      {
        shareId: "6518739802359149495",
        inviteCode: "abc",
        sourceUrl: "/multi-pin-share/6518739802359149495/?invite_code=abc&sender=1",
      }
    );
  });

  it("parses select-items share links (pin.it → multi-pin-share)", () => {
    // https://pin.it/1475gJNom expands to a multi-pin-share of selected pins
    const expanded =
      "https://www.pinterest.com/multi-pin-share/1971770775170950372/?invite_code=e00fe35558d64a50b0fef1d6da41ba29&sender=891290719912830476";
    assert.equal(isMultiPinShareUrl(expanded), true);
    assert.equal(classifyPinterestCollection(expanded), "board");
    assert.equal(isPinterestCollectionUrl(expanded), true);
    assert.deepEqual(parseMultiPinShare(expanded), {
      shareId: "1971770775170950372",
      inviteCode: "e00fe35558d64a50b0fef1d6da41ba29",
      sourceUrl:
        "/multi-pin-share/1971770775170950372/?invite_code=e00fe35558d64a50b0fef1d6da41ba29&sender=891290719912830476",
    });
  });

  it("still classifies profiles and boards", () => {
    assert.equal(classifyPinterestCollection("https://www.pinterest.com/someuser/"), "profile");
    assert.equal(
      classifyPinterestCollection("https://www.pinterest.com/someuser/my-board/"),
      "board"
    );
    assert.equal(classifyPinterestCollection("https://www.pinterest.com/pin/123456789012/"), null);
  });
});

describe("pinimg helpers", () => {
  it("upgrades sized urls to originals and grid covers", () => {
    assert.match(toOriginalsUrl("https://i.pinimg.com/736x/ab/cd/ef/abcd.jpg")!, /\/originals\//);
    assert.match(toGridCoverUrl("https://i.pinimg.com/originals/ab/cd/ef/abcd.jpg")!, /\/474x\//);
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

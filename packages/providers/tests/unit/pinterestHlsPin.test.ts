import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractFromPinObject } from "../../src/sites/pinterest/resolvePin/extractPin.ts";
import { configureFfmpeg } from "../../src/media/mux.ts";

/** Minimal HLS-only story pin shape (matches live PinResource for video idea pins). */
function hlsOnlyStoryPin(): Record<string, unknown> {
  return {
    id: "23573598045984812",
    grid_title: "Safari",
    images: {
      orig: {
        url: "https://i.pinimg.com/originals/20/97/db/2097dbe1d6b61f9c44a5767eeb9dcd84.jpg",
      },
    },
    videos: null,
    story_pin_data: {
      pages: [
        {
          video: {
            video_list: {
              V_HLSV3_MOBILE: {
                url: "https://v1.pinimg.com/videos/mc/hls/aa/bb/cc/aabbcc.m3u8",
                width: 1080,
                height: 1920,
                duration: 12,
              },
            },
          },
          blocks: [
            {
              type: "story_pin_video_block",
              video: {
                video_list: {
                  V_HLSV3_MOBILE: {
                    url: "https://v1.pinimg.com/videos/mc/hls/aa/bb/cc/aabbcc.m3u8",
                    width: 1080,
                    height: 1920,
                  },
                },
              },
            },
          ],
        },
      ],
    },
  };
}

describe("pinterest extractFromPinObject HLS story pins", () => {
  it("returns video URL when HLS is allowed", () => {
    const extracted = extractFromPinObject(hlsOnlyStoryPin(), true);
    assert.equal(extracted.imageUrl, null);
    assert.ok(extracted.videoUrl);
    assert.match(extracted.videoUrl!, /\.m3u8/i);
    assert.equal(extracted.videoRequiresHls, undefined);
  });

  it("does not fall back to cover image when HLS is disallowed", () => {
    const extracted = extractFromPinObject(hlsOnlyStoryPin(), false);
    assert.equal(extracted.videoUrl, null);
    assert.equal(extracted.imageUrl, null);
    assert.equal(extracted.videoRequiresHls, true);
    assert.ok(extracted.fallbacks.length > 0);
  });
});

describe("pinterest resolvePin HLS without ffmpeg", () => {
  it("throws a clear ffmpeg hint instead of downloading the cover", async () => {
    configureFfmpeg({ enabled: false });
    try {
      const { resolvePin } = await import("../../src/sites/pinterest/resolvePin/index.ts");
      // Use the public pin id; PinResource should report HLS-only video.
      await assert.rejects(
        () => resolvePin("https://www.pinterest.com/pin/23573598045984812/"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /ffmpeg|HLS/i);
          assert.doesNotMatch(err.message, /Could not find media/i);
          return true;
        }
      );
    } finally {
      configureFfmpeg({ enabled: true });
    }
  });
});

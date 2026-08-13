import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFacebookProfileUrl,
  isFacebookUrl,
} from "../../src/sites/facebook/extract.ts";

describe("facebook urls", () => {
  it("recognizes common facebook hosts", () => {
    assert.equal(isFacebookUrl("https://www.facebook.com/watch/?v=1"), true);
    assert.equal(isFacebookUrl("https://web.facebook.com/someuser"), true);
    assert.equal(isFacebookUrl("https://m.facebook.com/reel/123"), true);
    assert.equal(isFacebookUrl("https://fb.watch/abc"), true);
    assert.equal(isFacebookUrl("https://example.com"), false);
  });

  it("detects profile urls vs posts", () => {
    assert.equal(isFacebookProfileUrl("https://www.facebook.com/some.creator"), true);
    assert.equal(isFacebookProfileUrl("https://www.facebook.com/profile.php?id=123"), true);
    assert.equal(isFacebookProfileUrl("https://www.facebook.com/people/Name/1000123"), true);
    assert.equal(isFacebookProfileUrl("https://www.facebook.com/watch/?v=1"), false);
    assert.equal(isFacebookProfileUrl("https://www.facebook.com/reel/123"), false);
    assert.equal(isFacebookProfileUrl("https://www.facebook.com/photo/?fbid=1"), false);
  });
});

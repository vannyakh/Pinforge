import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanUrl, isHttpUrl, uniqHttpUrls, uniqStrings } from "../../src/index.ts";

describe("cleanUrl", () => {
  it("unescapes JSON and HTML encodings", () => {
    assert.equal(cleanUrl("https:\\/\\/cdn.example.com\\/a.jpg"), "https://cdn.example.com/a.jpg");
    assert.equal(cleanUrl("https://x.com\\u002Fa\\u0026b=1"), "https://x.com/a&b=1");
    assert.equal(cleanUrl("https://x.com/a&amp;b=1"), "https://x.com/a&b=1");
  });
});

describe("uniqHttpUrls", () => {
  it("cleans and dedupes http urls", () => {
    assert.deepEqual(
      uniqHttpUrls([
        "https:\\/\\/cdn.example.com\\/a.jpg",
        "https://cdn.example.com/a.jpg",
        "not-a-url",
      ]),
      ["https://cdn.example.com/a.jpg"]
    );
  });
});

describe("uniqStrings", () => {
  it("dedupes non-empty strings", () => {
    assert.deepEqual(uniqStrings(["a", "", "a", "b"]), ["a", "b"]);
  });
});

describe("isHttpUrl", () => {
  it("accepts http(s) and rejects others", () => {
    assert.equal(isHttpUrl("https://example.com/v"), true);
    assert.equal(isHttpUrl("http://example.com/v"), true);
    assert.equal(isHttpUrl("ftp://example.com/v"), false);
    assert.equal(isHttpUrl("not a url"), false);
  });
});

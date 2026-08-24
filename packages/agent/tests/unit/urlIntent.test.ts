import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyUrlIntent, extractUrls } from "../../src/router/urlIntent";

describe("urlIntent router", () => {
  const resolve = (url: string) => {
    if (url.includes("pinterest.com")) {
      return { id: "pinterest", label: "Pinterest", live: true, formats: ["best"], modes: ["single", "board"] };
    }
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      return { id: "youtube", label: "YouTube", live: true, formats: ["best"], modes: ["single", "playlist"] };
    }
    return null;
  };

  it("extracts urls from chat text", () => {
    const urls = extractUrls("Check https://www.pinterest.com/user/board/ and https://youtu.be/abc");
    assert.equal(urls.length, 2);
  });

  it("classifies pinterest board as extract intent", () => {
    const intent = classifyUrlIntent(
      "https://www.pinterest.com/soriyavan66/cattle-feeding-farm-life-shorts/",
      resolve
    );
    assert.equal(intent.kind, "board");
    assert.equal(intent.providerId, "pinterest");
    assert.equal(intent.suggestedAction, "extract");
    assert.equal(intent.confidence, "high");
  });

  it("classifies youtube watch url as download intent", () => {
    const intent = classifyUrlIntent("https://www.youtube.com/watch?v=dQw4w9WgXcQ", resolve);
    assert.equal(intent.kind, "single");
    assert.equal(intent.suggestedAction, "download");
  });

  it("returns unknown when no provider matches", () => {
    const intent = classifyUrlIntent("https://example.com/video/1", resolve);
    assert.equal(intent.kind, "unknown");
    assert.equal(intent.suggestedAction, "none");
  });
});

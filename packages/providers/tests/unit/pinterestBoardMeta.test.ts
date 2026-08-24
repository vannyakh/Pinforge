import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractBoardId } from "../../src/sites/pinterest/resolveBoard/htmlMeta.ts";
import {
  collectFeedPins,
  extractBoardFeedPinsFromHtml,
  extractPinsFromHtml,
} from "../../src/sites/pinterest/resolveBoard/htmlScrape.ts";

const BOARD_URL =
  "https://www.pinterest.com/soriyavan66/cattle-feeding-farm-life-shorts/";

const RELAY_BOARD_SNIPPET = `
BoardFeedResource":{"[[\\"add_vase\\",true],[\\"board_id\\",\\"891290651195182190\\"],[\\"field_set_key\\",\\"react_grid_pin\\"]]":{"data":[
{"node_id":"UGluOjg5MTI5MDU4MjUyODczODIyOQ==","seo_url":"/pin/891290582528738229/","type":"pin","id":"891290582528738229"},
{"node_id":"UGluOjEyMzQ1Njc4OTAxMjM0NTY3OA==","seo_url":"/pin/123456789012345678/","type":"pin","id":"123456789012345678"}
]}}
"type":"board","follower_count":0,"description":"","id":"891290651195182190","owner":{"type":"user","id":"891290719912830476"}
`;

describe("extractBoardId", () => {
  it("reads board_id from relay BoardFeedResource params", () => {
    assert.equal(extractBoardId(RELAY_BOARD_SNIPPET, BOARD_URL), "891290651195182190");
  });

  it("prefers relay board_id over owner user id in board object", () => {
    const html = `"type":"board","owner":{"type":"user","id":"891290719912830476"},"description":"","id":"891290651195182190"`;
    assert.equal(extractBoardId(html, BOARD_URL), "891290651195182190");
  });
});

describe("extractPinsFromHtml relay BoardFeed", () => {
  it("collects pin ids from embedded BoardFeedResource data", () => {
    const pins = extractPinsFromHtml(RELAY_BOARD_SNIPPET);
    const ids = pins.map((p) => p.pinId).sort();
    assert.deepEqual(ids, ["123456789012345678", "891290582528738229"]);
  });

  it("extractBoardFeedPinsFromHtml stays board-scoped", () => {
    const html = `${RELAY_BOARD_SNIPPET}/pin/999999999999999999/`;
    const pins = extractBoardFeedPinsFromHtml(html);
    const ids = pins.map((p) => p.pinId).sort();
    assert.deepEqual(ids, ["123456789012345678", "891290582528738229"]);
  });
});

describe("collectFeedPins", () => {
  it("prefers seo_url pin id over mismatched canonical id", () => {
    const map = new Map();
    collectFeedPins(
      [
        {
          type: "pin",
          id: "99994054228320593",
          seo_url: "/pin/891290582528738229/",
          grid_title: "Farm short",
        },
      ],
      map
    );
    assert.equal(map.size, 1);
    assert.equal(map.get("891290582528738229")?.pinId, "891290582528738229");
    assert.equal(map.get("891290582528738229")?.title, "Farm short");
  });
});

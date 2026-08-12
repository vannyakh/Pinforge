import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { packFolderName } from "@pinforge/types";
import { outDirForItems } from "../../src/process.ts";

const OUT = path.join(path.sep, "downloads");

describe("packFolderName", () => {
  it("keeps the source id so a re-download reuses the same folder", () => {
    assert.equal(
      packFolderName({ title: "Sunset shoot", id: "1234567890", provider: "pinterest" }),
      "Sunset-shoot-1234567890"
    );
  });

  it("drops the per-asset suffix so carousel assets share one folder", () => {
    const first = packFolderName({ title: "Sunset shoot (1)", id: "1234_0" });
    const second = packFolderName({ title: "Sunset shoot (2)", id: "1234_1" });
    assert.equal(first, second);
    assert.equal(first, "Sunset-shoot-1234");
  });

  it("falls back to the provider when there is no title", () => {
    assert.equal(packFolderName({ id: "abc", provider: "tiktok" }), "tiktok-abc");
  });

  it("strips path separators from the folder name", () => {
    assert.equal(packFolderName({ title: "a/b:c", id: "1" }), "abc-1");
  });
});

describe("outDirForItems", () => {
  const items = [
    { title: "Trip (1)", id: "99_0", provider: "pinterest" },
    { title: "Trip (2)", id: "99_1", provider: "pinterest" },
  ];

  it("gives a multi-file download its own folder", () => {
    assert.equal(outDirForItems(OUT, items), path.join(OUT, "Trip-99"));
  });

  it("leaves a single file in the download folder", () => {
    assert.equal(outDirForItems(OUT, [items[0]!]), OUT);
  });

  it("stays flat when grouping is turned off", () => {
    assert.equal(outDirForItems(OUT, items, false), OUT);
  });

  it("leaves files a provider already wrote into the download folder in place", () => {
    const written = items.map((item, i) => ({
      ...item,
      filePath: path.join(OUT, `trip-${i}.mp4`),
    }));
    assert.equal(outDirForItems(OUT, written), OUT);
  });
});

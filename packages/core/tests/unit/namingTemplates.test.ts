import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_NAMING_TEMPLATES,
  packFolderName,
  renderNamingTemplate,
  resolveMediaFileBase,
} from "@pinforge/types";

describe("renderNamingTemplate", () => {
  it("replaces known placeholders", () => {
    assert.equal(
      renderNamingTemplate("{provider}-{title}-{id}", {
        provider: "youtube",
        title: "Hello World",
        id: "xyz",
      }),
      "youtube-Hello-World-xyz"
    );
  });

  it("collapses empty placeholders and extra dashes", () => {
    assert.equal(
      renderNamingTemplate("{title}-{channel}-{id}", {
        title: "Clip",
        channel: "",
        id: "1",
      }),
      "Clip-1"
    );
  });

  it("strips unsafe path characters", () => {
    assert.equal(renderNamingTemplate("{title}", { title: "a/b:c*d?" }), "abcd");
  });
});

describe("resolveMediaFileBase", () => {
  it("uses the default template when none is set", () => {
    assert.equal(
      resolveMediaFileBase({ title: "Sunset", id: "99", provider: "youtube", ext: "mp4" }, {}),
      "Sunset-99"
    );
  });

  it("honours a custom file template", () => {
    assert.equal(
      resolveMediaFileBase(
        {
          title: "Sunset",
          id: "99",
          provider: "youtube",
          channel: "Artist",
          ext: "mp4",
          height: 1080,
          date: "2024-01-15",
        },
        {
          naming: { fileName: "{channel} - {title} [{quality}p]" },
          quality: "1080",
        }
      ),
      "Artist-Sunset-[1080p]"
    );
  });
});

describe("packFolderName with template", () => {
  it("defaults to title-id", () => {
    assert.equal(packFolderName({ title: "Trip", id: "abc", provider: "youtube" }), "Trip-abc");
  });

  it("uses a custom folder template", () => {
    assert.equal(
      packFolderName(
        { title: "Trip (2)", id: "abc_1", provider: "pinterest" },
        "{provider}-{title}"
      ),
      "pinterest-Trip"
    );
  });

  it("falls back to defaults from constants", () => {
    assert.equal(DEFAULT_NAMING_TEMPLATES.fileName, "{title}-{id}");
    assert.equal(DEFAULT_NAMING_TEMPLATES.folderName, "{title}-{id}");
  });
});

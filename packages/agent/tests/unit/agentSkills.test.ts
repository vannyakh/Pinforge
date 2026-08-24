import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAgentTask, buildToolPlan } from "../../src/skills/classifyTask";
import { getAgentSkill, listAgentSkills } from "../../src/skills/registry";
import type { UrlIntent } from "../../src/types";

const boardIntent: UrlIntent = {
  kind: "board",
  url: "https://www.pinterest.com/user/my-board/",
  providerId: "pinterest",
  providerLabel: "Pinterest",
  suggestedAction: "extract",
  confidence: "high",
};

const singleIntent: UrlIntent = {
  kind: "single",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  providerId: "youtube",
  providerLabel: "YouTube",
  suggestedAction: "download",
  confidence: "high",
};

describe("agent skill registry", () => {
  it("lists built-in skills", () => {
    const skills = listAgentSkills();
    assert.ok(skills.length >= 6);
    assert.ok(getAgentSkill("download-single"));
    assert.ok(getAgentSkill("extract-collection"));
  });
});

describe("classifyAgentTask", () => {
  it("routes pinterest board to extract-collection skill", () => {
    const task = classifyAgentTask({
      message: "https://www.pinterest.com/user/my-board/",
      urlIntents: [boardIntent],
    });
    assert.equal(task.skillId, "extract-collection");
    assert.equal(task.taskIntent, "extract_collection");
    assert.equal(task.confidence, "high");
    assert.ok(task.toolPlan.some((c) => c.name === "extract_preview"));
    assert.ok(task.systemPrompt.includes("extract-collection"));
  });

  it("routes youtube watch url to download-single skill", () => {
    const task = classifyAgentTask({
      message: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      urlIntents: [singleIntent],
    });
    assert.equal(task.skillId, "download-single");
    assert.equal(task.taskIntent, "download_url");
    assert.ok(task.toolPlan.some((c) => c.name === "start_download"));
  });

  it("routes queue command to queue-batch skill", () => {
    const task = classifyAgentTask({
      message: "queue this for later https://youtu.be/abc",
      urlIntents: [singleIntent],
    });
    assert.equal(task.skillId, "queue-batch");
    assert.equal(task.taskIntent, "queue_urls");
  });

  it("routes status question to check-status skill", () => {
    const task = classifyAgentTask({ message: "what is the download queue status?" });
    assert.equal(task.skillId, "check-status");
    assert.equal(task.taskIntent, "check_status");
  });

  it("falls back to general-chat for unrelated text", () => {
    const task = classifyAgentTask({ message: "hello, how does pinforge work?" });
    assert.equal(task.skillId, "general-chat");
    assert.equal(task.taskIntent, "chat");
  });
});

describe("buildToolPlan", () => {
  it("builds extract plan for collection skill", () => {
    const skill = getAgentSkill("extract-collection")!;
    const plan = buildToolPlan(skill, [boardIntent]);
    assert.deepEqual(
      plan.map((c) => c.name),
      ["detect_url", "extract_preview"]
    );
  });
});

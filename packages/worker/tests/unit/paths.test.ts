import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidateServerBinaries,
  candidateWorkerBinaries,
  parseWorkerJsonLine,
  parseServerResponseLine,
} from "../../src/paths.ts";

describe("candidateServerBinaries", () => {
  it("prefers env path and includes release/debug under repo rust/target", () => {
    const list = candidateServerBinaries({
      envPath: "C:\\tools\\pinforge-server.exe",
      platform: "win32",
      resourcesPath: null,
    });
    assert.equal(list[0], "C:\\tools\\pinforge-server.exe");
    assert.ok(list.some((p) => p.replace(/\\/g, "/").endsWith("rust/target/release/pinforge-server.exe")));
    assert.ok(list.some((p) => p.replace(/\\/g, "/").endsWith("rust/target/debug/pinforge-server.exe")));
  });

  it("includes electron resources/bin when resourcesPath set", () => {
    const list = candidateServerBinaries({
      envPath: "",
      platform: "linux",
      resourcesPath: "/opt/Pinforge/resources",
    }).map((p) => p.replace(/\\/g, "/"));
    assert.ok(list.includes("/opt/Pinforge/resources/bin/pinforge-server"));
    assert.ok(list.includes("/opt/Pinforge/resources/pinforge-server"));
  });
});

describe("candidateWorkerBinaries", () => {
  it("resolves worker CLI name for the platform", () => {
    const win = candidateWorkerBinaries({
      envPath: null,
      platform: "win32",
      resourcesPath: null,
    });
    assert.ok(win.some((p) => p.endsWith("pinforge-worker.exe")));
    const unix = candidateWorkerBinaries({
      envPath: null,
      platform: "darwin",
      resourcesPath: null,
    });
    assert.ok(unix.some((p) => p.endsWith("pinforge-worker")));
    assert.ok(!unix.some((p) => p.endsWith(".exe")));
  });
});

describe("parseWorkerJsonLine", () => {
  it("returns data from ok payload", () => {
    const data = parseWorkerJsonLine<{ enhance: string }>('{"ok":true,"data":{"enhance":"enhance-ok"}}\n');
    assert.equal(data.enhance, "enhance-ok");
  });

  it("throws when ok is false", () => {
    assert.throws(
      () => parseWorkerJsonLine('{"ok":false,"error":"boom"}'),
      /boom/
    );
  });
});

describe("parseServerResponseLine", () => {
  it("parses events", () => {
    const ev = parseServerResponseLine(
      JSON.stringify({ event: "server.ready", payload: { pid: 1 } })
    );
    assert.equal(ev.kind, "event");
    assert.equal(ev.event, "server.ready");
  });

  it("parses ok results", () => {
    const r = parseServerResponseLine(
      JSON.stringify({ id: "1", ok: true, result: { enhance: "enhance-ok" } })
    );
    assert.equal(r.kind, "result");
    assert.equal(r.id, "1");
    assert.deepEqual(r.result, { enhance: "enhance-ok" });
  });

  it("parses errors", () => {
    const r = parseServerResponseLine(
      JSON.stringify({ id: "2", ok: false, error: "nope" })
    );
    assert.equal(r.kind, "error");
    assert.equal(r.error, "nope");
  });
});

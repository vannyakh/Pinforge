/**
 * Smoke: provider detect + pipeline + optional live pin / youtube extractors.
 * Usage: pnpm --filter @pinterest-desktop/core smoke
 */
import { runPipeline } from "../src/pipeline/runPipeline.ts";
import { detectProvider, listProviders, processMedia } from "../src/index.ts";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const input = await sharp({
  create: {
    width: 64,
    height: 64,
    channels: 3,
    background: { r: 40, g: 80, b: 120 },
  },
})
  .jpeg()
  .toBuffer();

const out = await runPipeline(input, { preset: "auto" });
console.log("pipeline ok", out.ext, out.buffer.length);

const providers = listProviders();
const live = providers.filter((p) => p.status === "live").map((p) => p.id);
console.log("providers live:", live.join(", "));
if (!live.includes("pinterest") || !live.includes("youtube")) {
  throw new Error("expected pinterest + youtube live");
}

const pinUrl = "https://www.pinterest.com/pin/99360735500167749/";
const ytUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

console.log("detect pin →", detectProvider(pinUrl).id);
console.log("detect yt  →", detectProvider(ytUrl).id);

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pinforge-smoke-"));

try {
  const res = await processMedia(pinUrl, {
    outDir: path.join(tmp, "pin"),
    preset: "auto",
    enhance: true,
  });
  console.log(
    "pin processMedia:",
    res.results.length,
    "ok,",
    res.errors.length,
    "err",
    res.results[0]?.outPath ?? res.errors[0]?.error
  );
} catch (e) {
  console.warn("pin download skipped/failed:", e instanceof Error ? e.message : e);
}

try {
  const res = await processMedia(ytUrl, {
    outDir: path.join(tmp, "yt"),
    format: "best",
    enhance: false,
    preset: "auto",
  });
  console.log(
    "youtube processMedia:",
    res.results.length,
    "ok",
    res.results[0]?.outPath ?? res.errors[0]?.error
  );
} catch (e) {
  console.warn("youtube download:", e instanceof Error ? e.message : e);
}

console.log("smoke done");

#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import pc from "picocolors";
import prompts from "prompts";
import path from "node:path";
import {
  processMedia,
  listProviders,
  detectProvider,
  type FormatPreset,
  type PresetName,
} from "@pinterest-desktop/core";
import { printBanner } from "./banner.js";

const program = new Command();

program
  .name("pinforge")
  .description("Pinforge — multi-source media downloader")
  .version("0.1.0");

program
  .command("providers")
  .description("List available providers")
  .action(() => {
    printBanner();
    for (const p of listProviders()) {
      const badge =
        p.status === "live" ? pc.green("live") : pc.yellow(p.status);
      console.log(`  ${pc.bold(p.label.padEnd(22))} ${badge}`);
    }
    console.log();
  });

program
  .command("interactive")
  .description("Interactive download prompts")
  .action(async () => {
    printBanner();
    const answers = await prompts([
      {
        type: "text",
        name: "url",
        message: "Media URL",
        validate: (v) => (v?.trim() ? true : "URL required"),
      },
      {
        type: "text",
        name: "outDir",
        message: "Output folder",
        initial: path.join(process.cwd(), "downloads"),
      },
      {
        type: "select",
        name: "format",
        message: "Format",
        choices: [
          { title: "best", value: "best" },
          { title: "mp4", value: "mp4" },
          { title: "audio-only", value: "audio-only" },
        ],
        initial: 0,
      },
      {
        type: "confirm",
        name: "enhance",
        message: "Enhance images (Pinterest stills)?",
        initial: true,
      },
    ]);

    if (!answers.url) return;
    await runDownload(answers.url, {
      outDir: answers.outDir,
      format: answers.format,
      enhance: answers.enhance,
      preset: "auto",
    });
  });

program
  .argument("[url]", "Media URL to download")
  .option("-o, --out <dir>", "Output directory", path.join(process.cwd(), "downloads"))
  .option("-f, --format <preset>", "best | mp4 | audio-only", "best")
  .option("--enhance <preset>", "Image enhance preset (auto|soft|crisp|upscale|off)", "auto")
  .option("--extractor <url>", "Piped-compatible API base for YouTube")
  .action(async (url: string | undefined, opts) => {
    if (!url) {
      printBanner();
      program.help();
      return;
    }
    printBanner();
    const enhanceOff = opts.enhance === "off" || opts.enhance === "false";
    await runDownload(url, {
      outDir: opts.out,
      format: opts.format as FormatPreset,
      enhance: !enhanceOff,
      preset: (enhanceOff ? "auto" : opts.enhance) as PresetName,
      extractorUrl: opts.extractor,
    });
  });

async function runDownload(
  url: string,
  opts: {
    outDir: string;
    format?: FormatPreset;
    enhance?: boolean;
    preset?: PresetName;
    extractorUrl?: string;
  }
) {
  try {
    const provider = detectProvider(url);
    console.log(
      `  Provider: ${pc.cyan(provider.label)}${provider.live ? "" : pc.yellow(" (stub)")}`
    );
  } catch (e) {
    console.error(pc.red(e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
    return;
  }

  const spinner = ora("Downloading…").start();
  try {
    const res = await processMedia(url, {
      outDir: opts.outDir,
      preset: opts.preset ?? "auto",
      enhance: opts.enhance,
      format: opts.format,
      extractorUrl: opts.extractorUrl,
      onProgress: (info) => {
        spinner.text = `Downloading ${info.current}/${info.total}…`;
      },
    });
    spinner.succeed(
      `Saved ${res.results.length} file(s)${res.errors.length ? `, ${res.errors.length} failed` : ""}`
    );
    for (const r of res.results) {
      console.log(pc.green(`  → ${r.outPath}`));
    }
    for (const e of res.errors) {
      console.log(pc.red(`  ✗ ${e.url}: ${e.error}`));
    }
  } catch (e) {
    spinner.fail(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}

program.parseAsync(process.argv);

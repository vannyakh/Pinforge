#!/usr/bin/env node
/**
 * Pinforge CLI — thin client for pinforge-server (Rust).
 */
import { Command } from "commander";
import ora from "ora";
import pc from "picocolors";
import prompts from "prompts";
import path from "node:path";
import { ensureServer, getServerClient } from "@pinforge/worker";
import { printBanner } from "./banner.js";

const program = new Command();

program.name("pinforge").description("Pinforge — multi-source media downloader").version("0.1.0");

async function withServer<T>(fn: () => Promise<T>): Promise<T> {
  const dataDir = path.join(process.cwd(), ".pinforge-server-data");
  const client = await ensureServer(dataDir);
  if (!client) {
    throw new Error("pinforge-server not found. Run: node scripts/build-rust-server.js");
  }
  try {
    return await fn();
  } finally {
    // keep server for subsequent commands in same process; process exit cleans up
  }
}

program
  .command("providers")
  .description("List available providers (from pinforge-server)")
  .action(async () => {
    printBanner();
    try {
      await withServer(async () => {
        const list = await getServerClient().request<
          Array<{ id: string; label: string; live: boolean }>
        >("providers.list");
        for (const p of list) {
          const badge = p.live ? pc.green("live") : pc.yellow("stub");
          console.log(`  ${pc.bold(p.label.padEnd(22))} ${badge}`);
        }
        console.log();
      });
    } catch (e) {
      console.error(pc.red(e instanceof Error ? e.message : String(e)));
      process.exitCode = 1;
    }
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
    ]);
    if (!answers.url) return;
    await runDownload(answers.url, answers.outDir);
  });

program
  .argument("[url]", "Media URL to download")
  .option("-o, --out <dir>", "Output directory", path.join(process.cwd(), "downloads"))
  .action(async (url: string | undefined, opts) => {
    if (!url) {
      printBanner();
      program.help();
      return;
    }
    printBanner();
    await runDownload(url, opts.out);
  });

async function runDownload(url: string, outDir: string) {
  const spinner = ora("Downloading via pinforge-server…").start();
  try {
    await withServer(async () => {
      const client = getServerClient();
      await client.request("config.setOutDir", { outDir });
      const detected = await client.request<{
        matched?: boolean;
        provider?: string;
        label?: string;
      }>("providers.detect", { url });
      if (detected?.label) {
        spinner.text = `Provider: ${detected.label}`;
      }
      client.on("download.progress", (payload: unknown) => {
        const p = payload as { percent?: number };
        if (typeof p.percent === "number") {
          spinner.text = `Downloading… ${Math.round(p.percent)}%`;
        }
      });
      const result = await client.request<{
        ok: boolean;
        outPath?: string;
        job?: { error?: string; status?: string };
        via?: string;
      }>("media.process", { url, outDir });
      if (!result.ok || result.job?.status === "failed") {
        throw new Error(result.job?.error || "Download failed");
      }
      spinner.succeed(`Saved${result.via ? ` (${result.via})` : ""}`);
      if (result.outPath) console.log(pc.green(`  → ${result.outPath}`));
    });
  } catch (e) {
    spinner.fail(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}

program.parseAsync(process.argv);

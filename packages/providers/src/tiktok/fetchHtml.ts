/**
 * Load TikTok profile HTML / item list via Playwright.
 * Prefers installed Chrome (`channel: "chrome"`) — bundled Chromium is often
 * challenged. Fresh browser per call (no shared singleton) for reliability.
 * Uses page.content() + response interception (no page.evaluate).
 */

import type { Browser, BrowserContext, Response } from "playwright";

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  const args = ["--disable-blink-features=AutomationControlled"];
  try {
    return await chromium.launch({
      channel: "chrome",
      headless: true,
      args,
    });
  } catch {
    try {
      return await chromium.launch({ headless: true, args });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Playwright Chromium failed to launch. Run: pnpm exec playwright install chromium\n${msg}`
      );
    }
  }
}

export interface TikTokRenderedProfile {
  html: string;
  /** Raw item objects captured from /api/post/item_list/ while the page loaded / scrolled. */
  apiItems: Record<string, unknown>[];
}

export async function fetchTikTokProfileViaBrowser(
  pageUrl: string,
  opts?: {
    settleMs?: number;
    timeoutMs?: number;
    maxScrolls?: number;
    signal?: AbortSignal;
  }
): Promise<TikTokRenderedProfile> {
  opts?.signal?.throwIfAborted?.();
  const browser = await launchBrowser();
  let context: BrowserContext | null = null;
  const apiItems: Record<string, unknown>[] = [];
  const seenIds = new Set<string>();

  const ingestList = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const id = rec.id != null ? String(rec.id) : rec.aweme_id != null ? String(rec.aweme_id) : "";
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      apiItems.push(rec);
    }
  };

  const onResponse = async (res: Response) => {
    try {
      const u = res.url();
      if (!/\/api\/(post|repost)\/item_list\//i.test(u)) return;
      if (!res.ok()) return;
      const json = (await res.json()) as {
        itemList?: unknown[];
        aweme_list?: unknown[];
      };
      ingestList(json.itemList);
      ingestList(json.aweme_list);
    } catch {
      /* ignore non-json */
    }
  };

  try {
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
      extraHTTPHeaders: { Referer: "https://www.tiktok.com/" },
      viewport: { width: 1400, height: 900 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(opts?.timeoutMs ?? 60_000);
    page.on("response", onResponse);

    await page.goto(pageUrl, {
      waitUntil: "networkidle",
      timeout: opts?.timeoutMs ?? 60_000,
    });
    await page
      .waitForSelector("#__UNIVERSAL_DATA_FOR_REHYDRATION__, #SIGI_STATE", {
        timeout: 20_000,
      })
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, opts?.settleMs ?? 2200));

    // If still challenged / empty, one soft reload helps on some networks
    let htmlProbe = await page.content();
    if (!/__UNIVERSAL_DATA_FOR_REHYDRATION__|SIGI_STATE/i.test(htmlProbe)) {
      await page.reload({ waitUntil: "networkidle", timeout: opts?.timeoutMs ?? 60_000 });
      await new Promise((r) => setTimeout(r, 2000));
    }

    const scrolls = Math.max(1, Math.min(opts?.maxScrolls ?? 5, 16));
    for (let i = 0; i < scrolls; i++) {
      opts?.signal?.throwIfAborted?.();
      await page.mouse.wheel(0, 2800);
      await new Promise((r) => setTimeout(r, 1200));
      // Stop early once we have a decent feed page
      if (apiItems.length >= 12 && i >= 1) break;
    }

    await new Promise((r) => setTimeout(r, 1000));
    const html = await page.content();
    page.off("response", onResponse);
    return { html, apiItems };
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

/** @deprecated Prefer fetchTikTokProfileViaBrowser */
export async function fetchTikTokRenderedHtml(
  pageUrl: string,
  opts?: { settleMs?: number; timeoutMs?: number; signal?: AbortSignal }
): Promise<string> {
  const r = await fetchTikTokProfileViaBrowser(pageUrl, opts);
  return r.html;
}

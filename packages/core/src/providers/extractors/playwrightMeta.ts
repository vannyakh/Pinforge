import type { Browser, BrowserContext } from "playwright";
import { metaContent } from "./http";

export interface PageMeta {
  url: string;
  html: string;
  title?: string;
  description?: string;
  ogTitle?: string;
  ogImage?: string | null;
  ogVideo?: string | null;
  images: string[];
  videos: string[];
  /** Raw JSON-LD objects found in the rendered page. */
  jsonLd: unknown[];
}

export interface ScrapeMetaOptions {
  timeoutMs?: number;
  waitUntil?: "domcontentloaded" | "load" | "networkidle" | "commit";
  waitForSelector?: string;
  referer?: string;
  /** Extra settle time after load for SPA meta injection. */
  settleMs?: number;
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      try {
        return await chromium.launch({
          headless: true,
          args: ["--disable-blink-features=AutomationControlled"],
        });
      } catch (err) {
        browserPromise = null;
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Playwright Chromium failed to launch. Run: pnpm exec playwright install chromium\n${msg}`
        );
      }
    })();
  }
  return browserPromise;
}

export async function closePlaywrightBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch {
    /* ignore */
  } finally {
    browserPromise = null;
  }
}

function uniq(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/**
 * Load a URL in Chromium and scrape Open Graph / Twitter / JSON-LD / media URLs
 * from the rendered DOM (works when fetch-only HTML lacks meta).
 */
export async function scrapePageMeta(
  pageUrl: string,
  opts: ScrapeMetaOptions = {}
): Promise<PageMeta> {
  const browser = await getBrowser();
  let context: BrowserContext | null = null;

  try {
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
      extraHTTPHeaders: opts.referer ? { Referer: opts.referer } : undefined,
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();
    page.setDefaultTimeout(opts.timeoutMs ?? 45_000);

    await page.goto(pageUrl, {
      waitUntil: opts.waitUntil ?? "domcontentloaded",
      timeout: opts.timeoutMs ?? 45_000,
    });

    if (opts.waitForSelector) {
      await page
        .waitForSelector(opts.waitForSelector, { timeout: opts.timeoutMs ?? 45_000 })
        .catch(() => undefined);
    }

    if (opts.settleMs) {
      await new Promise((r) => setTimeout(r, opts.settleMs));
    } else {
      await new Promise((r) => setTimeout(r, 800));
    }

    // Prefer meta tags after client render
    await page
      .waitForFunction(
        () => {
          const doc = (
            globalThis as unknown as { document: { querySelector: (s: string) => unknown } }
          ).document;
          return Boolean(
            doc.querySelector(
              'meta[property="og:image"], meta[property="og:video"], meta[name="twitter:image"]'
            )
          );
        },
        { timeout: 8_000 }
      )
      .catch(() => undefined);

    const extracted = await page.evaluate(() => {
      const doc = (
        globalThis as unknown as {
          document: {
            title: string;
            documentElement: { outerHTML: string };
            querySelector: (s: string) => { getAttribute: (n: string) => string | null } | null;
            querySelectorAll: (s: string) => ArrayLike<{
              src?: string;
              textContent?: string | null;
              getAttribute: (n: string) => string | null;
            }>;
          };
        }
      ).document;

      const meta = (prop: string): string | null => {
        const el =
          doc.querySelector(`meta[property="${prop}"]`) ||
          doc.querySelector(`meta[name="${prop}"]`);
        return el?.getAttribute("content")?.trim() || null;
      };

      const images = [
        meta("og:image"),
        meta("og:image:secure_url"),
        meta("twitter:image"),
        meta("twitter:image:src"),
        ...Array.from(doc.querySelectorAll("img[src]"))
          .map((img) => img.src || img.getAttribute("src") || "")
          .filter((s) => /^https?:/i.test(s)),
      ].filter(Boolean) as string[];

      const videos = [
        meta("og:video"),
        meta("og:video:secure_url"),
        meta("og:video:url"),
        meta("twitter:player:stream"),
        ...Array.from(
          doc.querySelectorAll("video[src], video source[src], meta[property^='og:video']")
        )
          .map((el) => el.getAttribute("src") || el.getAttribute("content") || "")
          .filter((s) => /^https?:/i.test(s)),
      ].filter(Boolean) as string[];

      const jsonLd: unknown[] = [];
      for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          jsonLd.push(JSON.parse(script.textContent || "null"));
        } catch {
          /* skip */
        }
      }

      return {
        title: doc.title || undefined,
        description: meta("description") || meta("og:description") || undefined,
        ogTitle: meta("og:title") || undefined,
        ogImage: meta("og:image") || meta("og:image:secure_url"),
        ogVideo: meta("og:video") || meta("og:video:secure_url") || meta("og:video:url"),
        images,
        videos,
        jsonLd,
        html: doc.documentElement.outerHTML,
      };
    });

    const html = extracted.html;
    return {
      url: page.url(),
      html,
      title: extracted.ogTitle || extracted.title,
      description: extracted.description,
      ogTitle: extracted.ogTitle || metaContent(html, "og:title") || undefined,
      ogImage: extracted.ogImage || metaContent(html, "og:image"),
      ogVideo:
        extracted.ogVideo ||
        metaContent(html, "og:video") ||
        metaContent(html, "og:video:secure_url"),
      images: uniq(extracted.images),
      videos: uniq(extracted.videos),
      jsonLd: extracted.jsonLd,
    };
  } finally {
    await context?.close().catch(() => undefined);
  }
}

/**
 * Fetch HTML first; if OG media is missing, fall back to Playwright render.
 */
export async function fetchHtmlOrPlaywrightMeta(
  url: string,
  opts: ScrapeMetaOptions & { forcePlaywright?: boolean } = {}
): Promise<{ html: string; meta: PageMeta | null; via: "fetch" | "playwright" }> {
  if (!opts.forcePlaywright) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...(opts.referer ? { Referer: opts.referer } : {}),
        },
        redirect: "follow",
      });
      if (res.ok) {
        const html = await res.text();
        const hasMeta =
          Boolean(metaContent(html, "og:image")) ||
          Boolean(metaContent(html, "og:video")) ||
          Boolean(metaContent(html, "twitter:image"));
        if (hasMeta) {
          return {
            html,
            meta: {
              url,
              html,
              ogTitle: metaContent(html, "og:title") || undefined,
              ogImage: metaContent(html, "og:image"),
              ogVideo: metaContent(html, "og:video") || metaContent(html, "og:video:secure_url"),
              title: metaContent(html, "og:title") || undefined,
              images: [metaContent(html, "og:image")].filter(Boolean) as string[],
              videos: [
                metaContent(html, "og:video"),
                metaContent(html, "og:video:secure_url"),
              ].filter(Boolean) as string[],
              jsonLd: [],
            },
            via: "fetch",
          };
        }
      }
    } catch {
      /* playwright fallback */
    }
  }

  const meta = await scrapePageMeta(url, opts);
  return { html: meta.html, meta, via: "playwright" };
}

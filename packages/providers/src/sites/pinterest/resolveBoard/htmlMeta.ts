import { isPinterestHost } from "../shared/urls";

export function normalizeBoardUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!isPinterestHost(parsed.hostname)) {
    throw new Error("URL must be a pinterest.com board, profile, or search link");
  }

  let path = parsed.pathname.replace(/\/+$/, "");
  if (!path) throw new Error("Invalid board URL");

  const search = parsed.search || "";
  return `https://www.pinterest.com${path}/${search}`;
}

export function extractBoardName(html: string, boardUrl: string): string | undefined {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  if (og) return og.replace(/\s*[|\-–].*$/, "").trim();

  try {
    const u = new URL(boardUrl);
    const q = u.searchParams.get("q");
    if (q) return `search-${q}`;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1]?.replace(/-/g, " ");
  } catch {
    return undefined;
  }
}

function extractQuoted(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`);
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

export function extractAppVersion(html: string): string | undefined {
  return extractQuoted(html, ["app_version", "appVersion", "version"]);
}

export function extractUsername(html: string): string | undefined {
  return extractQuoted(html, ["username"]);
}

function extractNumericId(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(`"${key}"\\s*:\\s*"?(\\d{6,})"?`);
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/** Modern Pinterest HTML often omits board_id; resolve id from the board object for this URL. */
export function extractBoardId(html: string, boardUrl?: string): string | undefined {
  let path = "";
  try {
    if (boardUrl) {
      path = new URL(boardUrl).pathname.replace(/\/+$/, "");
    }
  } catch {
    path = "";
  }

  if (path && path !== "/") {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const byUrl =
      html.match(
        new RegExp(
          `"url"\\s*:\\s*"${escaped}/?"[\\s\\S]{0,500}?"(?:id|board_id)"\\s*:\\s*"(\\d{6,})"`,
          "i"
        )
      )?.[1] ||
      html.match(
        new RegExp(
          `"(?:id|board_id)"\\s*:\\s*"(\\d{6,})"\\s*[\\s\\S]{0,500}?"url"\\s*:\\s*"${escaped}/?"`,
          "i"
        )
      )?.[1];
    if (byUrl) return byUrl;

    // slug-only: ".../rc-vehicles/"
    const slug = path.split("/").filter(Boolean).pop();
    if (slug && slug.length >= 2) {
      const slugEsc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const bySlug =
        html.match(
          new RegExp(
            `"url"\\s*:\\s*"/[^"]*${slugEsc}/?"[\\s\\S]{0,400}?"(?:id|board_id)"\\s*:\\s*"(\\d{6,})"`,
            "i"
          )
        )?.[1] ||
        html.match(
          new RegExp(
            `"name"\\s*:\\s*"[^"]*"[\\s\\S]{0,200}?"url"\\s*:\\s*"/[^"]*${slugEsc}/?"[\\s\\S]{0,300}?"(?:id|board_id)"\\s*:\\s*"(\\d{6,})"`,
            "i"
          )
        )?.[1];
      if (bySlug) return bySlug;
    }
  }

  return (
    extractNumericId(html, ["board_id", "boardId"]) ||
    html.match(/"id"\s*:\s*"(\d{6,})"\s*,\s*"type"\s*:\s*"board"/i)?.[1] ||
    html.match(/"type"\s*:\s*"board"\s*,\s*"id"\s*:\s*"(\d{6,})"/i)?.[1] ||
    html.match(/"id"\s*:\s*"(\d{6,})"[\s\S]{0,160}"type"\s*:\s*"board"/i)?.[1] ||
    html.match(/"type"\s*:\s*"board"[\s\S]{0,160}"id"\s*:\s*"(\d{6,})"/i)?.[1]
  );
}

export function extractSectionId(html: string): string | undefined {
  return (
    extractNumericId(html, ["section_id", "sectionId"]) ||
    html.match(/"id"\s*:\s*"(\d{6,})"\s*,\s*"type"\s*:\s*"board_section"/i)?.[1] ||
    html.match(/"type"\s*:\s*"board_section"\s*,\s*"id"\s*:\s*"(\d{6,})"/i)?.[1] ||
    html.match(/"id"\s*:\s*"(\d{6,})"[\s\S]{0,160}"type"\s*:\s*"board_section"/i)?.[1]
  );
}

/** Extract profile user id from HTML (pinterest-js uses this for UserActivityPins). */
export function extractUserId(html: string, username?: string): string | undefined {
  const fromCover = html.match(/"profile_cover"\s*:\s*\{[^}]*"id"\s*:\s*"(\d+)"/i)?.[1];
  if (fromCover) return fromCover;

  const fromUsersPath = html.match(/\/users\/(\d+)\/pins/i)?.[1];
  if (fromUsersPath) return fromUsersPath;

  if (username) {
    const esc = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const byUser =
      html.match(
        new RegExp(
          `"username"\\s*:\\s*"${esc}"[\\s\\S]{0,400}?"(?:id|user_id|entityId)"\\s*:\\s*"(\\d{6,})"`,
          "i"
        )
      )?.[1] ||
      html.match(
        new RegExp(
          `"(?:id|user_id|entityId)"\\s*:\\s*"(\\d{6,})"\\s*[\\s\\S]{0,400}?"username"\\s*:\\s*"${esc}"`,
          "i"
        )
      )?.[1];
    if (byUser) return byUser;
  }

  return (
    extractNumericId(html, ["user_id", "userId"]) ||
    html.match(/"id"\s*:\s*"(\d{6,})"\s*,\s*"type"\s*:\s*"user"/i)?.[1] ||
    html.match(/"type"\s*:\s*"user"\s*,\s*"id"\s*:\s*"(\d{6,})"/i)?.[1]
  );
}

export function sourcePathFromUrl(boardUrl: string): string {
  try {
    const u = new URL(boardUrl);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return "/";
  }
}

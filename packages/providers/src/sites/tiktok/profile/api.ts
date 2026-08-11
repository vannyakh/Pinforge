import { EXTRACTOR_HEADERS } from "@pinforge/download";

export async function fetchItemListPage(opts: {
  secUid: string;
  cursor: number | string;
  count: number;
  profileUrl: string;
  signal?: AbortSignal;
}): Promise<{
  items: Record<string, unknown>[];
  cursor: number | string;
  hasMore: boolean;
}> {
  const endpoint = new URL("https://www.tiktok.com/api/post/item_list/");
  endpoint.searchParams.set("aid", "1988");
  endpoint.searchParams.set("count", String(opts.count));
  endpoint.searchParams.set("cursor", String(opts.cursor));
  endpoint.searchParams.set("device_platform", "web_pc");
  endpoint.searchParams.set("secUid", opts.secUid);

  const res = await fetch(endpoint.toString(), {
    headers: {
      ...EXTRACTOR_HEADERS,
      Accept: "application/json, text/plain, */*",
      Referer: opts.profileUrl,
    },
    redirect: "follow",
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`TikTok item_list failed (${res.status})`);
  }
  const json = (await res.json()) as {
    itemList?: Record<string, unknown>[];
    cursor?: number | string;
    hasMore?: boolean | number;
  };
  const items = Array.isArray(json.itemList) ? json.itemList : [];
  const hasMore = Boolean(json.hasMore) && items.length > 0;
  return {
    items,
    cursor: json.cursor ?? opts.cursor,
    hasMore,
  };
}

import { toOriginalsUrl } from "../shared/pinimg";
import { pinterestRequestHeaders } from "../shared/session";

export async function fetchOembed(
  pinId: string
): Promise<{ imageUrl: string | null; title?: string }> {
  try {
    const pinPage = `https://www.pinterest.com/pin/${pinId}/`;
    const oembedUrl = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(pinPage)}`;
    const res = await fetch(oembedUrl, {
      headers: pinterestRequestHeaders(),
      redirect: "follow",
    });
    if (!res.ok) return { imageUrl: null };
    const json = (await res.json()) as {
      url?: string;
      thumbnail_url?: string;
      title?: string;
    };
    const raw = json.thumbnail_url || json.url;
    if (!raw || typeof raw !== "string") return { imageUrl: null, title: json.title };
    return {
      imageUrl: toOriginalsUrl(raw),
      title: typeof json.title === "string" ? json.title : undefined,
    };
  } catch {
    return { imageUrl: null };
  }
}

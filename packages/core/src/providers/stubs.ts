import type { ProviderId } from "../types";
import type { MediaProvider } from "./types";
import { ProviderNotImplementedError } from "./types";
import { registerProvider } from "./registry";

const STUBS: { id: ProviderId; label: string; hosts: RegExp }[] = [
  { id: "facebook", label: "Facebook", hosts: /^(www\.)?(facebook\.com|fb\.watch|fb\.com)$/i },
  { id: "douyin", label: "Douyin", hosts: /^(www\.)?douyin\.com$/i },
  { id: "spotify", label: "Spotify", hosts: /^(open\.)?spotify\.com$/i },
  { id: "apple-music", label: "Apple Music", hosts: /^(music\.)?apple\.com$/i },
  { id: "capcut", label: "CapCut", hosts: /^(www\.)?capcut\.com$/i },
  { id: "bluesky", label: "Bluesky", hosts: /^(bsky\.app|bsky\.social)$/i },
  { id: "rednote", label: "RedNote / Xiaohongshu", hosts: /^(www\.)?(xiaohongshu\.com|xhslink\.com)$/i },
  { id: "threads", label: "Threads", hosts: /^(www\.)?threads\.net$/i },
  { id: "kuaishou", label: "Kuaishou", hosts: /^(www\.)?kuaishou\.com$/i },
  { id: "weibo", label: "Weibo", hosts: /^(www\.)?weibo\.com$/i },
];

function makeStub(id: ProviderId, label: string, hosts: RegExp): MediaProvider {
  return {
    id,
    label,
    live: false,
    match: (url) => {
      try {
        return hosts.test(new URL(url.trim()).hostname);
      } catch {
        return false;
      }
    },
    resolve: async () => {
      throw new ProviderNotImplementedError(id, label);
    },
  };
}

for (const s of STUBS) {
  registerProvider(makeStub(s.id, s.label, s.hosts));
}

export { STUBS };

import youtubeLogo from "@renderer/assets/provider-logos/youtube.svg";
import instagramLogo from "@renderer/assets/provider-logos/instagram.svg";
import tiktokLogo from "@renderer/assets/provider-logos/tiktok.svg";
import pinterestLogo from "@renderer/assets/provider-logos/pinterest.svg";
import facebookLogo from "@renderer/assets/provider-logos/facebook.svg";
import douyinLogo from "@renderer/assets/provider-logos/douyin.svg";
import spotifyLogo from "@renderer/assets/provider-logos/spotify.svg";
import appleMusicLogo from "@renderer/assets/provider-logos/apple-music.svg";
import capcutLogo from "@renderer/assets/provider-logos/capcut.svg";
import blueskyLogo from "@renderer/assets/provider-logos/bluesky.svg";
import rednoteLogo from "@renderer/assets/provider-logos/xiaohongshu.svg";
import threadsLogo from "@renderer/assets/provider-logos/threads.svg";
import kuaishouLogo from "@renderer/assets/provider-logos/kuaishou.svg";
import weiboLogo from "@renderer/assets/provider-logos/weibo.svg";

export const PROVIDER_LOGOS: Record<string, { src: string; alt: string }> = {
  youtube: { src: youtubeLogo, alt: "YouTube" },
  instagram: { src: instagramLogo, alt: "Instagram" },
  tiktok: { src: tiktokLogo, alt: "TikTok" },
  pinterest: { src: pinterestLogo, alt: "Pinterest" },
  facebook: { src: facebookLogo, alt: "Facebook" },
  douyin: { src: douyinLogo, alt: "Douyin" },
  spotify: { src: spotifyLogo, alt: "Spotify" },
  "apple-music": { src: appleMusicLogo, alt: "Apple Music" },
  capcut: { src: capcutLogo, alt: "CapCut" },
  bluesky: { src: blueskyLogo, alt: "Bluesky" },
  rednote: { src: rednoteLogo, alt: "RedNote" },
  threads: { src: threadsLogo, alt: "Threads" },
  kuaishou: { src: kuaishouLogo, alt: "Kuaishou" },
  weibo: { src: weiboLogo, alt: "Weibo" },
};

export function slugifyProviderId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

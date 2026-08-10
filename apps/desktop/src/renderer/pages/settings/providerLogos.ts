import youtubeLogo from "@renderer/assets/provider-logos/youtube.svg";
import instagramLogo from "@renderer/assets/provider-logos/instagram.svg";
import tiktokLogo from "@renderer/assets/provider-logos/tiktok.svg";
import pinterestLogo from "@renderer/assets/provider-logos/pinterest.svg";
import facebookLogo from "@renderer/assets/provider-logos/facebook.svg";

export const PROVIDER_LOGOS: Record<string, { src: string; alt: string }> = {
  youtube: { src: youtubeLogo, alt: "YouTube" },
  instagram: { src: instagramLogo, alt: "Instagram" },
  tiktok: { src: tiktokLogo, alt: "TikTok" },
  pinterest: { src: pinterestLogo, alt: "Pinterest" },
  facebook: { src: facebookLogo, alt: "Facebook" },
};

export function slugifyProviderId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

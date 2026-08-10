import React from "react";

export type PlatformId = "pinterest" | "youtube" | "instagram" | "tiktok" | "facebook" | "ytdlp";

export interface PlatformDef {
  id: PlatformId;
  label: string;
  live: boolean;
  accent: string;
  tint: string;
}

export const PLATFORMS: PlatformDef[] = [
  {
    id: "pinterest",
    label: "Pinterest",
    live: true,
    accent: "#E60023",
    tint: "rgba(230, 0, 35, 0.14)",
  },
  {
    id: "youtube",
    label: "YouTube",
    live: true,
    accent: "#FF0033",
    tint: "rgba(255, 0, 51, 0.14)",
  },
  {
    id: "instagram",
    label: "Instagram",
    live: true,
    accent: "#E4405F",
    tint: "rgba(228, 64, 95, 0.14)",
  },
  {
    id: "tiktok",
    label: "TikTok",
    live: true,
    accent: "#25F4EE",
    tint: "rgba(37, 244, 238, 0.12)",
  },
  {
    id: "facebook",
    label: "Facebook",
    live: true,
    accent: "#1877F2",
    tint: "rgba(24, 119, 242, 0.14)",
  },
  {
    id: "ytdlp",
    label: "yt-dlp",
    live: true,
    accent: "#F59E0B",
    tint: "rgba(245, 158, 11, 0.14)",
  },
];

export const PlatformIcon: React.FC<{ id: PlatformId; size?: number }> = ({ id, size = 16 }) => {
  const s = size;
  switch (id) {
    case "pinterest":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2C6.5 2 2 6.5 2 12c0 4.2 2.6 7.8 6.3 9.2-.1-.8-.2-2 0-2.9.2-.8 1.3-5.5 1.3-5.5s-.3-.7-.3-1.6c0-1.5.9-2.6 2-2.6.9 0 1.4.7 1.4 1.5 0 .9-.6 2.3-.9 3.5-.3 1.1.5 1.9 1.5 1.9 1.8 0 3.2-1.9 3.2-4.6 0-2.4-1.7-4.1-4.2-4.1-2.9 0-4.5 2.1-4.5 4.3 0 .9.3 1.8.8 2.3.1.1.1.2.1.3l-.3 1.2c0 .2-.2.2-.4.1-1.4-.7-2.3-2.7-2.3-4.4 0-3.6 2.6-6.9 7.5-6.9 3.9 0 7 2.8 7 6.5 0 3.9-2.4 7-5.8 7-1.1 0-2.2-.6-2.6-1.3l-.7 2.7c-.3 1-1 2.2-1.5 3C10 21.9 11 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2z" />
        </svg>
      );
    case "youtube":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.8 15.5v-7l6.2 3.5-6.2 3.5z" />
        </svg>
      );
    case "instagram":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4zm6.4-8.5a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0zM12 2.2c-2.7 0-3 0-4.1.1-2.8.1-5.1 2.4-5.2 5.2-.1 1.1-.1 1.4-.1 4.1s0 3 .1 4.1c.1 2.8 2.4 5.1 5.2 5.2 1.1.1 1.4.1 4.1.1s3 0 4.1-.1c2.8-.1 5.1-2.4 5.2-5.2.1-1.1.1-1.4.1-4.1s0-3-.1-4.1c-.1-2.8-2.4-5.1-5.2-5.2-1.1-.1-1.4-.1-4.1-.1zm0 1.8c2.6 0 2.9 0 4 .1 2.1.1 3.1 1.1 3.2 3.2.1 1.1.1 1.3.1 3.9s0 2.9-.1 4c-.1 2-.1 3.1-3.2 3.2-1.1.1-1.3.1-4 .1s-2.9 0-4-.1c-2.1-.1-3.1-1.1-3.2-3.2-.1-1.1-.1-1.3-.1-3.9s0-2.9.1-4c.1-2.1 1.1-3.1 3.2-3.2 1.1-.1 1.4-.1 4-.1z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19.6 7.2a5.8 5.8 0 0 1-3.4-1.1v7.3a5.7 5.7 0 1 1-4.9-5.6v2.9a2.8 2.8 0 1 0 2 2.7V2.2h2.8a5.8 5.8 0 0 0 5.5 5v2.8c-.7 0-1.4-.1-2-.3z" />
        </svg>
      );
    case "facebook":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M22 12.1C22 6.5 17.5 2 11.9 2S2 6.5 2 12.1c0 5 3.7 9.1 8.4 9.9v-7H7.9v-2.9h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.5v1.8h2.8l-.4 2.9h-2.3v7c4.7-.8 8.4-4.9 8.4-9.9z" />
        </svg>
      );
    case "ytdlp":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 3a1 1 0 0 1 1 1v9.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L11 13.6V4a1 1 0 0 1 1-1zM5 18a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1z" />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
};

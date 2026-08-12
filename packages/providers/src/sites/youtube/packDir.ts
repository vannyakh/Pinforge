import path from "node:path";
import { packFolderName } from "@pinforge/types";

export type YoutubePackDirInput = {
  packFolders?: boolean;
  channelDir: string;
  title: string;
  videoId: string;
  folderTemplate?: string;
};

/**
 * Output directory for a YouTube video and its sidecars.
 * When pack folders are enabled (default), every download lands in
 * `channelDir/<folder>/` so video, audio, subtitles, and thumbnails stay together.
 */
export function resolveYoutubePackDir(input: YoutubePackDirInput): string {
  if (input.packFolders === false) return input.channelDir;
  const folderName = packFolderName(
    { title: input.title, id: input.videoId, provider: "youtube" },
    input.folderTemplate
  );
  return path.join(input.channelDir, folderName);
}

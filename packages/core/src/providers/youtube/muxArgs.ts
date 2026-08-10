/** Build ffmpeg argv for muxing separate video + audio streams (stream copy). */
export function muxAvCopyArgs(videoPath: string, audioPath: string, outPath: string): string[] {
  return [
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-c",
    "copy",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0?",
    "-shortest",
    "-movflags",
    "+faststart",
    outPath,
  ];
}

/**
 * Retry argv when stream-copy fails (e.g. mismatched containers):
 * keep video copy, re-encode audio to AAC for a playable MP4/WebM.
 */
export function muxAvRemuxArgs(videoPath: string, audioPath: string, outPath: string): string[] {
  return [
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0?",
    "-shortest",
    "-movflags",
    "+faststart",
    outPath,
  ];
}

import React, { useCallback, useEffect, useRef, useState } from "react";
import { PauseOne, PlayOne, VolumeMute, VolumeNotice } from "@icon-park/react";

type PublishReelsVideoPlayerProps = {
  src: string;
  poster?: string;
  className?: string;
  /** `feed` = letterboxed Facebook post video; `reels` = full-bleed vertical cover */
  variant?: "feed" | "reels";
};

const PublishReelsVideoPlayer: React.FC<PublishReelsVideoPlayerProps> = ({
  src,
  poster,
  className,
  variant = "reels",
}) => {
  const isFeed = variant === "feed";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setFailed(false);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }, [src, poster]);

  const syncPlaying = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setPlaying(!video.paused && !video.ended);
  }, []);

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video || failed) return;
    try {
      if (video.paused || video.ended) {
        if (video.ended) video.currentTime = 0;
        await video.play();
        setPlaying(true);
      } else {
        video.pause();
        setPlaying(false);
      }
    } catch {
      setPlaying(false);
    }
  }, [failed]);

  const toggleMuted = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const seek = useCallback((ratio: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(video.duration, ratio * video.duration));
    setProgress(video.currentTime / video.duration);
  }, []);

  if (failed) {
    return (
      <div
        className={`fb-reels-player fb-reels-player--failed ${isFeed ? "fb-reels-player--feed" : ""} ${className ?? ""}`}
      >
        <span className="fb-reels-player__failed-label">Could not load video</span>
      </div>
    );
  }

  return (
    <div
      className={`fb-reels-player ${isFeed ? "fb-reels-player--feed" : ""} ${className ?? ""}`}
    >
      <button
        type="button"
        className="fb-reels-player__surface"
        onClick={() => void togglePlay()}
        aria-label={playing ? "Pause video" : "Play video"}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className="fb-reels-player__video"
          muted={muted}
          playsInline
          preload="metadata"
          onPlay={syncPlaying}
          onPause={syncPlaying}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={() => {
            const video = videoRef.current;
            if (!video?.duration) return;
            setProgress(video.currentTime / video.duration);
          }}
          onError={() => setFailed(true)}
        />
        {!playing ? (
          <span className="fb-reels-player__play-overlay" aria-hidden>
            <span className="fb-reels-player__play-btn">
              <PlayOne theme="filled" size={isFeed ? 28 : 52} fill="currentColor" />
            </span>
          </span>
        ) : null}
      </button>

      {!isFeed ? (
        <button
          type="button"
          className="fb-reels-player__mute"
          onClick={(e) => {
            e.stopPropagation();
            toggleMuted();
          }}
          aria-label={muted ? "Unmute video" : "Mute video"}
        >
          {muted ? (
            <VolumeMute theme="outline" size="18" fill="currentColor" />
          ) : (
            <VolumeNotice theme="outline" size="18" fill="currentColor" />
          )}
        </button>
      ) : playing ? (
        <button
          type="button"
          className="fb-reels-player__mute fb-reels-player__mute--feed"
          onClick={(e) => {
            e.stopPropagation();
            toggleMuted();
          }}
          aria-label={muted ? "Unmute video" : "Mute video"}
        >
          {muted ? (
            <VolumeMute theme="outline" size="16" fill="currentColor" />
          ) : (
            <VolumeNotice theme="outline" size="16" fill="currentColor" />
          )}
        </button>
      ) : null}

      {!isFeed && playing ? (
        <button
          type="button"
          className="fb-reels-player__pause-fab"
          onClick={(e) => {
            e.stopPropagation();
            void togglePlay();
          }}
          aria-label="Pause video"
        >
          <PauseOne theme="filled" size="20" fill="currentColor" />
        </button>
      ) : null}

      {!isFeed ? (
        <div
          className="fb-reels-player__progress"
          role="slider"
          aria-label="Video progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width <= 0) return;
            seek((e.clientX - rect.left) / rect.width);
          }}
        >
          <span className="fb-reels-player__progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
};

export default PublishReelsVideoPlayer;

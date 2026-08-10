import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@arco-design/web-react";
import { Minus } from "@icon-park/react";
import "@renderer/components/layout/Titlebar/titlebar.css";
import bannerEase from "@resources/onboard/banner-ease.png";
import bannerAny from "@resources/onboard/banner-any.png";
import bannerOnline from "@resources/onboard/banner-online.png";
import bannerMastery from "@resources/onboard/banner-mastery.png";
import { api } from "@renderer/api";

export const ONBOARD_PREVIEW_KEY = "pinforge:onboard-preview";

type StepId = "ffmpeg" | "ytdlp" | "playwright";
type StepState = "waiting" | "active" | "done" | "failed" | "skipped";

type StepRow = {
  id: StepId;
  label: string;
  state: StepState;
  message: string;
};

type FeatureSlide = {
  id: string;
  banner: string;
  alt: string;
};

const FEATURES: FeatureSlide[] = [
  { id: "ease", banner: bannerEase, alt: "Download videos with ease" },
  { id: "any", banner: bannerAny, alt: "Download any video" },
  { id: "online", banner: bannerOnline, alt: "Download online videos with ease" },
  { id: "mastery", banner: bannerMastery, alt: "Video download mastery" },
];

const SLIDE_COUNT = FEATURES.length;
/** Clones at both ends for seamless loop: [last, ...items, first] */
const LOOP_SLIDES: FeatureSlide[] = [FEATURES[SLIDE_COUNT - 1]!, ...FEATURES, FEATURES[0]!];
const AUTO_MS = 4500;
const SWIPE_PX = 56;

function realIndexFromTrack(track: number): number {
  if (track <= 0) return SLIDE_COUNT - 1;
  if (track >= SLIDE_COUNT + 1) return 0;
  return track - 1;
}

const INITIAL_STEPS: StepRow[] = [
  { id: "ffmpeg", label: "ffmpeg", state: "waiting", message: "" },
  { id: "ytdlp", label: "yt-dlp", state: "waiting", message: "" },
  { id: "playwright", label: "Playwright Chromium", state: "waiting", message: "" },
];

function normalizeStep(step: string): StepId | null {
  if (step === "ffmpeg" || step === "ytdlp" || step === "playwright") return step;
  return null;
}

function overallPercent(steps: StepRow[], currentPercent: number): number {
  const n = steps.length;
  if (n === 0) return 0;
  const doneCount = steps.filter((s) => s.state === "done" || s.state === "skipped").length;
  if (doneCount >= n) return 100;
  const base = (doneCount / n) * 100;
  const slice = 100 / n;
  return Math.min(
    99,
    Math.round(base + (slice * Math.max(0, Math.min(100, currentPercent))) / 100)
  );
}

function isPreviewSession(): boolean {
  try {
    return sessionStorage.getItem(ONBOARD_PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

function clearPreviewSession(): void {
  try {
    sessionStorage.removeItem(ONBOARD_PREVIEW_KEY);
  } catch {
    /* ignore */
  }
}

export type EnvironmentSetupProps = {
  onFinished: () => void;
};

const OnboardCarousel: React.FC = () => {
  // track index into LOOP_SLIDES; start on first real slide
  const [track, setTrack] = useState(1);
  const [animate, setAnimate] = useState(true);
  const [dragPx, setDragPx] = useState(0);
  const [paused, setPaused] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const trackRef = useRef(track);
  trackRef.current = track;

  const goToReal = useCallback((real: number) => {
    setAnimate(true);
    setTrack(real + 1);
  }, []);

  const step = useCallback((delta: number) => {
    setAnimate(true);
    setTrack((t) => t + delta);
  }, []);

  useEffect(() => {
    if (paused || dragging.current) return;
    const id = window.setInterval(() => step(1), AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, step, track]);

  const onTransitionEnd = () => {
    const t = trackRef.current;
    if (t === SLIDE_COUNT + 1) {
      setAnimate(false);
      setTrack(1);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimate(true));
      });
    } else if (t === 0) {
      setAnimate(false);
      setTrack(SLIDE_COUNT);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimate(true));
      });
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    startX.current = e.clientX;
    setDragPx(0);
    setPaused(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setDragPx(e.clientX - startX.current);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const dx = e.clientX - startX.current;
    setDragPx(0);
    if (dx <= -SWIPE_PX) step(1);
    else if (dx >= SWIPE_PX) step(-1);
    setPaused(false);
  };

  const real = realIndexFromTrack(track);
  const offsetPct = -track * 100;
  const dragStyle =
    dragPx !== 0
      ? { transform: `translate3d(calc(${offsetPct}% + ${dragPx}px), 0, 0)` }
      : { transform: `translate3d(${offsetPct}%, 0, 0)` };

  return (
    <div
      className="env-setup__swiper"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        if (!dragging.current) setPaused(false);
      }}
    >
      <div
        className={
          animate && dragPx === 0
            ? "env-setup__track env-setup__track--animate"
            : "env-setup__track"
        }
        style={dragStyle}
        onTransitionEnd={onTransitionEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {LOOP_SLIDES.map((f, i) => (
          <div key={`${f.id}-${i}`} className="env-setup__slide">
            <img className="env-setup__banner" src={f.banner} alt={f.alt} draggable={false} />
          </div>
        ))}
      </div>
      <div className="env-setup__dots" role="tablist" aria-label="Features">
        {FEATURES.map((f, i) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={i === real}
            aria-label={f.alt}
            className={i === real ? "is-active" : undefined}
            onClick={() => goToReal(i)}
          />
        ))}
      </div>
    </div>
  );
};

const EnvironmentSetup: React.FC<EnvironmentSetupProps> = ({ onFinished }) => {
  const preview = useRef(isPreviewSession()).current;
  const [steps, setSteps] = useState<StepRow[]>(INITIAL_STEPS);
  const [statusMessage, setStatusMessage] = useState(
    preview ? "Onboarding preview — environment install skipped" : "Preparing environment…"
  );
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [currentPercent, setCurrentPercent] = useState(preview ? 0 : 0);
  const startedRef = useRef(false);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void api.setInstallerMode(true);
  }, []);

  useEffect(() => {
    return () => {
      if (finishTimer.current) clearTimeout(finishTimer.current);
    };
  }, []);

  const patchStep = useCallback((id: StepId, patch: Partial<StepRow>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const leaveInstaller = useCallback(() => {
    clearPreviewSession();
    void api.setInstallerMode(false).finally(() => onFinished());
  }, [onFinished]);

  const finishSoon = useCallback(() => {
    setStatusMessage("Environment ready");
    setCurrentPercent(100);
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(() => leaveInstaller(), 700);
  }, [leaveInstaller]);

  const runSetup = useCallback(async () => {
    setRunning(true);
    setFailed(false);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setStatusMessage("Installing environment…");
    setCurrentPercent(0);

    try {
      const result = await api.environmentSetupStart();
      setSteps((prev) =>
        prev.map((s) => {
          const tool = result.tools[s.id];
          if (tool?.available) {
            return {
              ...s,
              state: s.state === "failed" ? s.state : "done",
              message: tool.version || s.message || "Ready",
            };
          }
          if (s.state === "failed") return s;
          return { ...s, state: "failed", message: s.message || "Not installed" };
        })
      );

      if (result.done) {
        finishSoon();
        return;
      }

      const missing =
        !result.tools.ffmpeg.available ||
        !result.tools.ytdlp.available ||
        !result.tools.playwright.available;
      if (missing) {
        setFailed(true);
        setStatusMessage("Some components could not be installed");
      } else {
        await api.environmentSetupComplete();
        finishSoon();
      }
    } catch (e) {
      setFailed(true);
      setStatusMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [finishSoon]);

  useEffect(() => {
    return api.onEnvironmentSetupProgress((ev) => {
      const id = normalizeStep(ev.step);
      if (!id) return;
      setCurrentPercent(ev.percent);
      setStatusMessage(ev.message);

      if (ev.phase === "check" || ev.phase === "download" || ev.phase === "extract") {
        patchStep(id, { state: "active", message: ev.message });
      } else if (ev.phase === "done" || ev.phase === "skip") {
        patchStep(id, {
          state: ev.phase === "skip" ? "skipped" : "done",
          message: ev.message,
        });
      } else if (ev.phase === "error") {
        setFailed(true);
        patchStep(id, { state: "failed", message: ev.message });
      }
    });
  }, [patchStep]);

  useEffect(() => {
    if (preview || startedRef.current) return;
    startedRef.current = true;
    void runSetup();
  }, [preview, runSetup]);

  const percent = preview ? 0 : overallPercent(steps, currentPercent);

  const continueAnyway = async () => {
    try {
      await api.environmentSetupComplete();
    } catch {
      /* still leave installer */
    }
    leaveInstaller();
  };

  const closePreview = async () => {
    try {
      await api.environmentSetupComplete();
    } catch {
      /* ignore */
    }
    leaveInstaller();
  };

  return (
    <div className="env-setup" data-theme="dark">
      <header className="env-setup__titlebar">
        <div className="env-setup__titlebar-label">Pinforge desktop installer</div>
        <div className="env-setup__titlebar-actions">
          <button
            type="button"
            className="app-window-controls__button"
            onClick={() => void window.api.windowMinimize()}
            aria-label="Minimize"
          >
            <Minus theme="outline" size="14" fill="currentColor" strokeWidth={4} />
          </button>
        </div>
      </header>

      <main className="env-setup__stage">
        <OnboardCarousel />
      </main>

      <footer className="env-setup__footer">
        <div className="env-setup__footer-meta">
          <span className="env-setup__footer-status">{statusMessage}</span>
        </div>
        <div className="env-setup__footer-row">
          <div
            className="env-setup__bar"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="env-setup__bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="env-setup__percent">{percent}%</span>
        </div>

        {preview && (
          <div className="env-setup__actions">
            <Button type="primary" onClick={() => void closePreview()}>
              Close preview
            </Button>
          </div>
        )}

        {failed && !running && !preview && (
          <div className="env-setup__actions">
            <Button type="primary" onClick={() => void runSetup()}>
              Retry
            </Button>
            <Button onClick={() => void continueAnyway()}>Continue anyway</Button>
          </div>
        )}
      </footer>
    </div>
  );
};

export default EnvironmentSetup;

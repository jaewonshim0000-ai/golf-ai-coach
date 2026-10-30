"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { savePoseModelAction, type PoseState } from "@/app/actions";
import { packFrames, slowMotionOf, unpackFrames, type PoseModel } from "@/lib/golf/pose";
import { trustworthyFrames } from "@/lib/golf/motion-analysis";
import { detectView } from "@/lib/golf/framing";
import { BodyOverlay } from "@/components/swing/body-overlay";
import { captureGolfPosePro } from "@/lib/golfposepro/capture";
import { GPP_VERSION, frameTime } from "@/lib/golfposepro/result";
import { clipWindow, getClip } from "@/lib/video-store";
import { cn } from "@/lib/utils";
import { browserClient } from "@/lib/db/supabase";
import { Button } from "@/components/ui/primitives";
/**
 * Connected clips use expiring signed URLs. Older device-local clips and
 * demo recordings load from IndexedDB. Both honor a saved trim. The analysis
 * is GolfPosePro's: every frame read, phases from the wrist height.
 */
export function SwingVideo({
  id,
  videoUrl,
  analysable = false,
  clipStart = null,
  clipEnd = null,
  model = null,
  className,
}: {
  id: string;
  videoUrl: string | null;
  /** Full player with automatic analysis, rather than a library card. */
  analysable?: boolean;
  /** Trim stored on the swing row, in seconds. */
  clipStart?: number | null;
  clipEnd?: number | null;
  model?: PoseModel | null;
  className?: string;
}) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const analysisRun = useRef<AbortController | null>(null);
  useEffect(() => () => analysisRun.current?.abort(), [id, videoUrl]);
  const remote = videoUrl?.startsWith("supabase://swing-videos/") ? videoUrl.slice("supabase://swing-videos/".length) : null;
  const clipId = videoUrl?.startsWith("local://clip/") ? videoUrl.slice("local://clip/".length) : id;
  const [src, setSrc] = useState<string | null>(videoUrl?.startsWith("https://") ? videoUrl : null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [analysis, setAnalysis] = useState<PoseState | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [aspect, setAspect] = useState(3 / 4);
  const [overlay, setOverlay] = useState(true);
  const [loop, setLoop] = useState(false);
  const attempted = useRef<string | null>(null);
  const analyseCurrent = useRef<() => Promise<void>>(async () => undefined);
  // A swing read before GolfPosePro, or by an older version of it, is read again.
  const savedModel = model?.motionVersion === 1 && model.imageFrames && model.golfPosePro?.version === GPP_VERSION ? model : null;
  const gpp = savedModel?.golfPosePro;
  const view = savedModel?.cameraAngle ?? "other";
  // Model times are video seconds for GolfPosePro tracks; `scale` stays for older ones.
  const scale = slowMotionOf(savedModel);
  const tracked = useMemo(() => savedModel ? trustworthyFrames(unpackFrames(savedModel), savedModel.aspect ?? aspect, view) : [], [savedModel, aspect, view]);
  const reviewWindow: [number, number] | null = gpp ? [frameTime(gpp, gpp.swingStart), frameTime(gpp, gpp.swingEnd)] : null;
  /*
    Reading frames off the canvas needs a cross-origin-enabled element, but a
    host that does not send the matching header will refuse to play at all
    with it set. Playback matters more than analysis, so a failure drops the
    attribute and reloads once, and the analyser says why it went away.
  */
  const [crossOrigin, setCrossOrigin] = useState(true);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    if (remote) {
      const sb = browserClient();
      async function refreshUrl() {
        if (!sb) return;
        const { data, error } = await sb.storage.from("swing-videos").createSignedUrl(remote!, 3600);
        if (!live) return;
        if (error) setError("Could not load this video. Refresh to try again.");
        else { setSrc(data.signedUrl); setError(null); }
      }
      void refreshUrl();
      const refresh = window.setInterval(() => void refreshUrl(), 50 * 60 * 1000);
      return () => { live = false; window.clearInterval(refresh); };
    }
    getClip(clipId)
      .then((found) => {
        if (!live || !found) return;
        url = URL.createObjectURL(found.blob);
        setSrc(url);
      })
      // No IndexedDB (private window, storage blocked): fall back to the URL.
      .catch(() => undefined);
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, clipId, remote]);
  const [start, end] = clipWindow(clipStart, clipEnd, duration);
  const trimChanged = Boolean(savedModel?.clip && duration > 0 &&
    (Math.abs(savedModel.clip[0] - start) > 0.1 || Math.abs(savedModel.clip[1] - end) > 0.1));
  const trackedModel = trimChanged ? null : savedModel;
  useEffect(() => {
    const element = video.current;
    if (!element || !src || !element.requestVideoFrameCallback) return;
    let stopped = false;
    let callback = 0;
    const sample = () => {
      callback = element.requestVideoFrameCallback((_, metadata) => {
        if (stopped) return;
        setTime(metadata.mediaTime / scale);
        window.dispatchEvent(new CustomEvent("swing:frame", { detail: { id, time: metadata.mediaTime / scale, paused: element.paused } }));
        sample();
      });
    };
    sample();
    return () => { stopped = true; element.cancelVideoFrameCallback(callback); };
  }, [src, id, scale]);
  async function analyse() {
    const element = video.current;
    if (!element || analysing || analysisRun.current) return;
    const run = new AbortController();
    analysisRun.current = run;
    setAnalysing(true);
    setAnalysis(null);
    setLoop(false);
    setProgress("Preparing GolfPosePro");
    // Frame callbacks depend on presenting the video. A button below a tall
    // player can scroll it offscreen, causing the browser to skip callbacks.
    element.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const wasTime = element.currentTime;
    try {
      if (!element.videoWidth || !element.videoHeight) throw new Error("The video has not loaded yet.");
      const span: [number, number] = end > start ? [start, end] : [0, element.duration];
      const { analysed } = await captureGolfPosePro(element, span[0], span[1],
        (done, total) => setProgress(`GolfPosePro is reading frame ${done} of ${total}`), run.signal);
      run.signal.throwIfAborted();
      if (!analysed || analysed.track.length < 8) throw new Error("GolfPosePro could not find a swing in this video. Keep your whole body and hands in view from setup through the finish.");
      setProgress("Saving your video review");
      const packed = packFrames(analysed.track);
      const address = analysed.result.keyFrames[0]!.pose?.map(([x, y, visibility]) => ({ x, y, z: 0, visibility }));
      const saved = await savePoseModelAction({
        swing_session_id: id,
        t: packed.t,
        imageFrames: packed.imageFrames,
        aspect: element.videoWidth / element.videoHeight,
        cameraAngle: (address && detectView([address], element.videoWidth / element.videoHeight)) ?? "face_on",
        clip: span,
        reconstruct: false,
        expectedRevision: model?.revision ?? null,
        sourceVideo: videoUrl,
        golfPosePro: analysed.result,
      });
      run.signal.throwIfAborted();
      setAnalysis(saved);
      if (saved.ok) { setOverlay(true); router.refresh(); }
    } catch (error) {
      if (run.signal.aborted) return;
      setAnalysis({
        ok: false,
        message: error instanceof Error && error.name === "SecurityError"
          ? "This video's storage settings prevent reading its frames."
          : error instanceof Error ? error.message : "Could not track this video. Try again.",
      });
    } finally {
      if (analysisRun.current === run) analysisRun.current = null;
      if (!run.signal.aborted) element.currentTime = wasTime;
      setProgress(null);
      setAnalysing(false);
    }
  }
  analyseCurrent.current = analyse;
  useEffect(() => {
    if (!analysable || !src || !Number.isFinite(duration) || duration <= 0 || !crossOrigin || trackedModel || analysing) return;
    const key = `${id}:${src}:${start}:${end}`;
    if (attempted.current === key) return;
    const timer = window.setTimeout(() => {
      if (attempted.current === key) return;
      attempted.current = key;
      void analyseCurrent.current();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [analysable, id, src, duration, crossOrigin, trackedModel, analysing, start, end]);
  useEffect(() => {
    const element = video.current;
    if (element && trackedModel && reviewWindow) {
      element.currentTime = reviewWindow[0];
      element.playbackRate = SLOW_REPLAY(scale);
    }
  }, [trackedModel]); // eslint-disable-line react-hooks/exhaustive-deps -- once per saved analysis
  useEffect(() => {
    const show = () => { setLoop(false); video.current?.scrollIntoView({ block: "center", behavior: "smooth" }); };
    window.addEventListener("swing:review", show);
    return () => window.removeEventListener("swing:review", show);
  }, []);
  if (!src) {
    return (
      <div
        className={cn(
          "hero-art-dusk flex items-center justify-center rounded-2xl text-white/70",
          className ?? "aspect-[3/4]",
        )}
      >
        <Video className="h-6 w-6" aria-hidden />
        <span className="ml-2 text-xs">{error ?? (remote ? "Loading video…" : "No video on this device")}</span>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      <div className={cn("relative overflow-hidden rounded-2xl bg-black", className)} style={{ aspectRatio: aspect }}>
      <video
        data-swing-player
        data-slow-motion={scale}
        ref={video}
        src={src}
        crossOrigin={crossOrigin ? "anonymous" : undefined}
        controls={analysable && !analysing}
        muted={!analysable}
        playsInline
        preload="metadata"
        onError={(event) => {
          if (crossOrigin) {
            setCrossOrigin(false);
            event.currentTarget.load();
            return;
          }
          setError("This browser could not play the video. Try an MP4 export of your clip.");
        }}
        className="absolute inset-0 h-full w-full object-contain"
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          if (Number.isFinite(element.duration)) setDuration(element.duration);
          setAspect(element.videoWidth / element.videoHeight || 3 / 4);
          // Park on the first frame of the clip so a card shows the swing, not black.
          element.currentTime = Number.isFinite(element.duration) ? clipStart ?? 0.05 : 3600;
        }}
        onDurationChange={(event) => {
          const element = event.currentTarget;
          if (Number.isFinite(element.duration) && element.duration > 0) {
            setDuration(element.duration);
            if (element.currentTime >= element.duration - 0.05) element.currentTime = clipStart ?? 0.05;
          }
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          if (!element.requestVideoFrameCallback) {
            setTime(element.currentTime / scale);
            window.dispatchEvent(new CustomEvent("swing:frame", { detail: { id, time: element.currentTime / scale, paused: element.paused } }));
          }
          if (analysing || end <= start) return;
          const bounds = loop && reviewWindow ? reviewWindow : [start, end];
          if (element.currentTime > bounds[1]! || element.currentTime < bounds[0]! - 0.3) element.currentTime = bounds[0]!;
        }}
        onSeeked={(event) => {
          setTime(event.currentTarget.currentTime / scale);
          window.dispatchEvent(new CustomEvent("swing:frame", { detail: { id, time: event.currentTarget.currentTime / scale, paused: event.currentTarget.paused } }));
        }}
        onPause={(event) => window.dispatchEvent(new CustomEvent("swing:frame", { detail: { id, time: event.currentTarget.currentTime / scale, paused: true } }))}
      />
      {trackedModel && tracked.length > 0 && overlay && !analysing ? <BodyOverlay frames={tracked} time={time} view={view} aspect={aspect}
        plane={view === "down_the_line" ? trackedModel.setup : undefined} /> : null}
      {analysing ? <div role="status" className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-black/75 px-3 py-2 text-center text-[12px] text-white">{progress}</div> : null}
      </div>
      {trackedModel ? <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-muted">
        <label className="flex min-h-10 cursor-pointer items-center gap-2"><input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} className="accent-accent" /> Show setup guides</label>
        <span>Green hips / gold hand trail{view === "down_the_line" && trackedModel.setup ? " / blue plane line" : ""}</span>
      </div> : null}
      {trackedModel && reviewWindow ? <Button type="button" size="sm" variant="secondary" onClick={() => {
        const element = video.current;
        if (!element) return;
        setLoop(true); element.currentTime = reviewWindow[0]; element.playbackRate = SLOW_REPLAY(scale);
        void element.play().catch(() => setLoop(false));
      }}>Replay in slow motion</Button> : null}
      {error ? <p role="alert" className="text-xs text-bad">{error}</p> : null}
      {trimChanged ? <p role="status" className="text-[11px] text-fg-muted">The clip changed. Reviewing this part of the recording automatically.</p> : null}
      {analysable ? (
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="dsp text-[10px] tracking-[0.17em] text-fg-subtle">Swing analysis</p>
              <p className="mt-1 text-[11px] leading-[1.5] text-fg-muted">
                {!crossOrigin
                  ? "This video will play but cannot be read, because its storage does not allow it."
                  : progress ?? (trackedModel
                    ? `GolfPosePro · ${gpp!.wristY.length} frames read · swing ${frameTime(gpp!, gpp!.swingStart).toFixed(2)}–${frameTime(gpp!, gpp!.swingEnd).toFixed(2)}s`
                    : "GolfPosePro reads every frame and finds your swing phases automatically.")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void analyse()}
              disabled={analysing || !crossOrigin || duration <= 0}
            >
              {analysing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {analysing ? "Reviewing..." : trackedModel ? "Review again" : "Review video"}
            </Button>
          </div>
          {analysing && progress !== "Saving your video review" ? <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => analysisRun.current?.abort()}>Cancel tracking</Button> : null}
          {analysis ? (
            <p
              role="status"
              className={cn(
                "mt-2.5 rounded-lg px-3 py-2 text-[11.5px] leading-[1.5]",
                analysis.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad",
              )}
            >
              {analysis.message}
              {analysis.ok && analysis.skipped ? (
                <>
                  {" "}
                  {analysis.skipped} position{analysis.skipped === 1 ? " was" : "s were"} left alone
                  because you had already measured {analysis.skipped === 1 ? "it" : "them"}.
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
/** Real-speed clips replay at a quarter speed; slow-motion clips already are slow. */
const SLOW_REPLAY = (scale: number) => scale > 1 ? 1 : 0.25;

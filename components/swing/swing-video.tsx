"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  savePoseModelAction,
  saveSwingClipAction,
  type PoseState,
} from "@/app/actions";
import { packFrames, unpackFrames, type PoseModel } from "@/lib/golf/pose";
import { trustworthyFrames, type MotionView } from "@/lib/golf/motion-analysis";
import { reviewFaceOn } from "@/lib/golf/face-on-review";
import { analyseVideoModel } from "@/lib/golf/video-review";
import { BodyOverlay } from "@/components/swing/body-overlay";
import { SwingTiming } from "@/components/swing/swing-timing";
import { SwingSetup } from "@/components/swing/swing-setup";
import { readSwing } from "@/lib/pose-runner";
import { clampClip, clipWindow, getClip } from "@/lib/video-store";
import { cn } from "@/lib/utils";
import { browserClient } from "@/lib/db/supabase";
import { Button, Select } from "@/components/ui/primitives";
/**
 * Connected clips use expiring signed URLs. Older device-local clips and
 * demo recordings load from IndexedDB. Both support saved trims.
 */
export function SwingVideo({
  id,
  videoUrl,
  trimmable = false,
  analysable = false,
  clipStart = null,
  clipEnd = null,
  model = null,
  cameraAngle = "other",
  className,
}: {
  id: string;
  videoUrl: string | null;
  trimmable?: boolean;
  /** Show the frame-analysis control under the player. */
  analysable?: boolean;
  /** Trim stored on the swing row, in seconds. */
  clipStart?: number | null;
  clipEnd?: number | null;
  model?: PoseModel | null;
  cameraAngle?: MotionView;
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
  const [trim, setTrim] = useState<[number | null, number | null]>([clipStart, clipEnd]);
  const [duration, setDuration] = useState(0);
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const [trimming, setTrimming] = useState(false);
  const [analysis, setAnalysis] = useState<PoseState | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [aspect, setAspect] = useState(3 / 4);
  const [overlay, setOverlay] = useState(true);
  const [loop, setLoop] = useState(false);
  const attempted = useRef<string | null>(null);
  const analyseCurrent = useRef<() => Promise<void>>(async () => undefined);
  const [view, setView] = useState<MotionView>(model?.cameraAngle ?? cameraAngle);
  const savedModel = model?.motionVersion === 1 && model.imageFrames ? model : null;
  const tracked = useMemo(() => savedModel ? trustworthyFrames(unpackFrames(savedModel), savedModel.aspect ?? aspect, view) : [], [savedModel, aspect, view]);
  const review = useMemo(() => savedModel ? reviewFaceOn(unpackFrames(savedModel), savedModel.aspect ?? aspect, view) : null, [savedModel, aspect, view]);
  const report = useMemo(() => savedModel ? analyseVideoModel(savedModel) : null, [savedModel]);
  const reviewWindow: [number, number] | null = savedModel && report?.phases
    ? [savedModel.t[report.phases.address]!, Math.min(savedModel.t.at(-1)!, savedModel.t[report.phases.impact]! + 0.25)]
    : review?.window ?? null;
  const guide = savedModel?.phasesConfirmed && report?.phases ? tracked[report.phases.address]
    : review?.guide ?? (report?.phases ? tracked[report.phases.address] : undefined);
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
  const [start, end] = draft ?? clipWindow(trim[0], trim[1], duration);
  const trimChanged = Boolean(savedModel?.clip && duration > 0 &&
    (Math.abs(savedModel.clip[0] - start) > 0.1 || Math.abs(savedModel.clip[1] - end) > 0.1));
  const trackedModel = trimChanged || savedModel?.cameraAngle !== view ? null : savedModel;
  useEffect(() => {
    const element = video.current;
    if (!element || !src || !element.requestVideoFrameCallback) return;
    let stopped = false;
    let callback = 0;
    const sample = () => {
      callback = element.requestVideoFrameCallback((_, metadata) => {
        if (stopped) return;
        setTime(metadata.mediaTime);
        window.dispatchEvent(new CustomEvent("swing:frame", { detail: { id, time: metadata.mediaTime, paused: element.paused } }));
        sample();
      });
    };
    sample();
    return () => { stopped = true; element.cancelVideoFrameCallback(callback); };
  }, [src, id]);
  async function analyse() {
    const element = video.current;
    if (!element || analysing || analysisRun.current) return;
    const run = new AbortController();
    analysisRun.current = run;
    setAnalysing(true);
    setAnalysis(null);
    setLoop(false);
    setProgress("Preparing automatic video review");
    // Frame callbacks depend on presenting the video. A button below a tall
    // player can scroll it offscreen, causing the browser to skip callbacks.
    element.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const wasTime = element.currentTime;
    try {
      if (!element.videoWidth || !element.videoHeight) throw new Error("The video has not loaded yet.");
      const span: [number, number] = end > start ? [start, end] : [0, element.duration];
      const posed = await readSwing(element, span[0], span[1], (done, total) =>
        setProgress("Tracking visible joints: " + Math.min(100, Math.round(done / total * 100)) + "%"), view, run.signal,
      );
      run.signal.throwIfAborted();
      if (posed.length < 8) throw new Error("Too few frames could be tracked. Keep your whole body visible and try a brighter recording.");
      setProgress("Saving your video review");
      const packed = packFrames(posed);
      const saved = await savePoseModelAction({
        swing_session_id: id,
        t: packed.t,
        imageFrames: packed.imageFrames,
        aspect: element.videoWidth / element.videoHeight,
        cameraAngle: view,
        clip: span,
        reconstruct: false,
      });
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
      analysisRun.current = null;
      if (!run.signal.aborted) element.currentTime = wasTime;
      setProgress(null);
      setAnalysing(false);
    }
  }
  analyseCurrent.current = analyse;
  useEffect(() => {
    if (!analysable || !src || !Number.isFinite(duration) || duration <= 0 || !crossOrigin || trackedModel || analysing || trimming || draft) return;
    const key = `${id}:${src}:${start}:${end}:${view}`;
    if (attempted.current === key) return;
    const timer = window.setTimeout(() => {
      if (attempted.current === key) return;
      attempted.current = key;
      void analyseCurrent.current();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [analysable, id, src, duration, crossOrigin, trackedModel, analysing, trimming, view, draft, start, end]);
  useEffect(() => {
    const element = video.current;
    if (element && trackedModel && reviewWindow) {
      element.currentTime = reviewWindow[0];
      element.playbackRate = 0.5;
    }
  }, [trackedModel, report, review]);
  useEffect(() => {
    const show = () => { setLoop(false); video.current?.scrollIntoView({ block: "center", behavior: "smooth" }); };
    window.addEventListener("swing:review", show);
    return () => window.removeEventListener("swing:review", show);
  }, []);
  async function saveTrim(next: [number, number]) {
    analysisRun.current?.abort();
    setTrimming(true);
    const [lo, hi] = clampClip(next[0], next[1], duration);
    const previous = trim;
    setTrim([lo, hi]);
    setDraft(null);
    let result;
    try { result = await saveSwingClipAction({ swing_session_id: id, start: lo, end: hi }); }
    catch { result = { ok: false, message: "Could not save the clip. Please try again." }; }
    setTrimming(false);
    if (result.ok) {
      setError(null);
      return;
    }
    // Put the handles back where they were rather than showing a trim that
    // exists only in this tab.
    setTrim(previous);
    setError(result.message ?? "Could not save the trim. Please try again.");
  }
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
        ref={video}
        src={src}
        crossOrigin={crossOrigin ? "anonymous" : undefined}
        controls={trimmable && !analysing}
        muted={!trimmable}
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
          element.currentTime = Number.isFinite(element.duration) ? trim[0] ?? 0.05 : 3600;
        }}
        onDurationChange={(event) => {
          const element = event.currentTarget;
          if (Number.isFinite(element.duration) && element.duration > 0) {
            setDuration(element.duration);
            if (element.currentTime >= element.duration - 0.05) element.currentTime = trim[0] ?? 0.05;
          }
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          if (!element.requestVideoFrameCallback) {
            setTime(element.currentTime);
            window.dispatchEvent(new CustomEvent("swing:frame", { detail: { id, time: element.currentTime, paused: element.paused } }));
          }
          if (analysing || end <= start) return;
          const bounds = loop && reviewWindow ? reviewWindow : [start, end];
          if (element.currentTime > bounds[1]! || element.currentTime < bounds[0]! - 0.3) element.currentTime = bounds[0]!;
        }}
        onSeeked={(event) => {
          setTime(event.currentTarget.currentTime);
          window.dispatchEvent(new CustomEvent("swing:frame", { detail: { id, time: event.currentTarget.currentTime, paused: event.currentTarget.paused } }));
        }}
        onPause={(event) => window.dispatchEvent(new CustomEvent("swing:frame", { detail: { id, time: event.currentTarget.currentTime, paused: true } }))}
      />
      {trackedModel && tracked.length > 0 && overlay && !analysing ? <BodyOverlay frames={tracked} time={time} guide={guide ?? undefined} view={view} aspect={aspect}
        plane={view === "down_the_line" ? trackedModel.setup : undefined} /> : null}
      {analysing ? <div role="status" className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-black/75 px-3 py-2 text-center text-[12px] text-white">{progress}</div> : null}
      </div>
      {trackedModel ? <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-muted">
        <label className="flex min-h-10 cursor-pointer items-center gap-2"><input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} className="accent-accent" /> Show setup guides</label>
        <span>Green hips / gold hand trail / faint setup outline{view === "down_the_line" && trackedModel.setup ? " / blue plane line" : ""}</span>
      </div> : null}
      {trackedModel && reviewWindow ? <Button type="button" size="sm" variant="secondary" onClick={() => {
        const element = video.current;
        if (!element) return;
        setLoop(true); element.currentTime = reviewWindow[0]; element.playbackRate = 0.5;
        void element.play().catch(() => setLoop(false));
      }}>Replay with guides - half speed</Button> : null}
      {error ? <p role="alert" className="text-xs text-bad">{error}</p> : null}
      {trimChanged ? <p role="status" className="text-[11px] text-fg-muted">The clip changed. Reviewing this part of the recording automatically.</p> : null}
      {analysable ? (
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="dsp text-[10px] tracking-[0.17em] text-fg-subtle">2D swing analysis</p>
              <p className="mt-1 text-[11px] leading-[1.5] text-fg-muted">
                {!crossOrigin
                  ? "This video will play but cannot be read, because its storage does not allow it."
                  : (progress ??
                    "Tracks visible movement and adds guides to your recording. The first review downloads the tracking model; later reviews reuse it.")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void analyse()}
              disabled={analysing || trimming || !crossOrigin || duration <= 0}
            >
              {analysing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {analysing ? "Reviewing..." : trackedModel ? "Review again" : "Review video"}
            </Button>
          </div>
          <label className="mt-3 block text-[11px] text-fg-muted">Camera view
            <Select aria-label="Swing camera view" value={view} disabled={analysing || trimming} onChange={(event) => setView(event.target.value as MotionView)} className="mt-1">
              <option value="face_on">Face on · facing your chest</option>
              <option value="down_the_line">Down the line · behind you</option>
              <option value="other">Other angle · limited measurements</option>
            </Select>
          </label>
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
      {analysable && trackedModel && report?.phases ? <SwingSetup src={src} crossOrigin={crossOrigin} frames={tracked} time={trackedModel.t[report.phases.address]!}
        view={view} aspect={trackedModel.aspect ?? aspect} saved={trackedModel.setup} sessionId={id} /> : null}
      {analysable && trackedModel ? <SwingTiming model={trackedModel} sessionId={id} unresolved={!report?.phases} /> : null}
      {trimmable ? (
        <details className="rounded-xl border border-border bg-surface-2 p-3">
          <summary className="min-h-8 cursor-pointer text-[12px] font-medium text-fg-muted">Shorten recording (optional)</summary>
          <div className="flex items-center justify-between">
            <p className="dsp text-[10px] tracking-[0.17em] text-fg-subtle">Video clip</p>
            <p className="tabular text-[11px] text-fg-muted">
              {start.toFixed(1)}s &ndash; {(end || duration).toFixed(1)}s
            </p>
          </div>
          <div className="mt-2 space-y-2">
            <Handle
              label="Start"
              value={start}
              max={duration}
              onInput={(value) => setDraft([Math.min(value, end - 0.2), end])}
              onCommit={() => saveTrim([start, end])}
            />
            <Handle
              label="End"
              value={end || duration}
              max={duration}
              onInput={(value) => setDraft([start, Math.max(value, start + 0.2)])}
              onCommit={() => saveTrim([start, end])}
            />
          </div>
          <p className="mt-2 text-[10.5px] leading-[1.5] text-fg-subtle">
            Saved with the swing, so the same clip plays on every device.
          </p>
        </details>
      ) : null}
    </div>
  );
}
function Handle({
  label,
  value,
  max,
  onInput,
  onCommit,
}: {
  label: string;
  value: number;
  max: number;
  onInput: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="dsp w-10 shrink-0 text-[10px] tracking-[0.15em] text-fg-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={max || 1}
        step={0.1}
        value={value}
        onChange={(event) => onInput(Number(event.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-track accent-accent"
      />
    </label>
  );
}

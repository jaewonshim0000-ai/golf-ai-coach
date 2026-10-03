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
import { findAutomaticTiming, trustworthyFrames, type MotionView } from "@/lib/golf/motion-analysis";
import { BodyOverlay } from "@/components/swing/body-overlay";
import { readSwing } from "@/lib/pose-runner";
import { clampClip, clipWindow, getClip } from "@/lib/video-store";
import { cn } from "@/lib/utils";
import { browserClient } from "@/lib/db/supabase";
import { Button } from "@/components/ui/primitives";

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
  const remote = videoUrl?.startsWith("supabase://swing-videos/") ? videoUrl.slice("supabase://swing-videos/".length) : null;
  const clipId = videoUrl?.startsWith("local://clip/") ? videoUrl.slice("local://clip/".length) : id;
  const [src, setSrc] = useState<string | null>(videoUrl?.startsWith("https://") ? videoUrl : null);
  const [error, setError] = useState<string | null>(null);
  const [trim, setTrim] = useState<[number | null, number | null]>([clipStart, clipEnd]);
  const [duration, setDuration] = useState(0);
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const [analysis, setAnalysis] = useState<PoseState | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [aspect, setAspect] = useState(3 / 4);
  const [overlay, setOverlay] = useState(true);
  const [view, setView] = useState<MotionView>(model?.cameraAngle ?? cameraAngle);
  const savedModel = model?.motionVersion === 1 && model.imageFrames ? model : null;
  const tracked = useMemo(() => savedModel ? trustworthyFrames(unpackFrames(savedModel), savedModel.aspect ?? aspect) : [], [model, aspect]);
  const phases = useMemo(() => savedModel?.phasesConfirmed ? savedModel.phases : findAutomaticTiming(tracked, savedModel?.aspect ?? aspect)?.phases, [model, tracked, aspect]);
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
  const trackedModel = trimChanged ? null : savedModel;

  useEffect(() => {
    const element = video.current;
    if (!element || !src || !element.requestVideoFrameCallback) return;
    let stopped = false;
    let callback = 0;
    const sample = () => {
      callback = element.requestVideoFrameCallback((_, metadata) => {
        if (stopped) return;
        setTime(metadata.mediaTime);
        sample();
      });
    };
    sample();
    return () => { stopped = true; element.cancelVideoFrameCallback(callback); };
  }, [src]);

  async function analyse() {
    const element = video.current;
    if (!element || analysing) return;
    setAnalysing(true);
    setAnalysis(null);
    setProgress("Loading the body tracker");
    // Frame callbacks depend on presenting the video. A button below a tall
    // player can scroll it offscreen, causing the browser to skip callbacks.
    element.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const wasTime = element.currentTime;
    try {
      if (!element.videoWidth || !element.videoHeight) throw new Error("The video has not loaded yet.");
      const span: [number, number] = end > start ? [start, end] : [0, element.duration];
      const posed = await readSwing(element, span[0], span[1], (done, total) =>
        setProgress("Tracking visible joints: " + Math.min(100, Math.round(done / total * 100)) + "%"),
      );
      if (posed.length < 8) throw new Error("Too few clear body frames. Trim to one complete swing, keep the whole body visible, and use a brighter clip.");
      setProgress("Checking tracking and visible movement");
      const saved = await savePoseModelAction({
        swing_session_id: id,
        ...packFrames(posed),
        aspect: element.videoWidth / element.videoHeight,
        cameraAngle: view,
        clip: span,
      });
      setAnalysis(saved);
      if (saved.ok) router.refresh();
    } catch (error) {
      setAnalysis({
        ok: false,
        message: error instanceof Error && error.name === "SecurityError"
          ? "This video's storage settings prevent reading its frames."
          : error instanceof Error ? error.message : "Could not track this video. Try again.",
      });
    } finally {
      element.currentTime = wasTime;
      setProgress(null);
      setAnalysing(false);
    }
  }

  async function saveTrim(next: [number, number]) {
    const [lo, hi] = clampClip(next[0], next[1], duration);
    const previous = trim;
    setTrim([lo, hi]);
    setDraft(null);
    const result = await saveSwingClipAction({ swing_session_id: id, start: lo, end: hi });
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
          setDuration(element.duration);
          setAspect(element.videoWidth / element.videoHeight || 3 / 4);
          // Park on the first frame of the clip so a card shows the swing, not black.
          element.currentTime = trim[0] ?? 0.05;
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          setTime(element.currentTime);
          if (analysing || end <= start) return;
          if (element.currentTime > end || element.currentTime < start - 0.3) {
            element.currentTime = start;
          }
        }}
        onSeeked={(event) => setTime(event.currentTarget.currentTime)}
      />
      {trackedModel && tracked.length > 0 && overlay && !analysing ? <BodyOverlay frames={tracked} time={time} guide={phases ? tracked[phases.address] : undefined} /> : null}
      {analysing ? <div role="status" className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-black/75 px-3 py-2 text-center text-[12px] text-white">{progress}</div> : null}
      </div>
      {trackedModel ? <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-muted">
        <label className="flex min-h-10 cursor-pointer items-center gap-2"><input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} className="accent-accent" /> Show body tracking</label>
        <span>Orange shoulders · green hips · gold hand path</span>
      </div> : null}
      {error ? <p role="alert" className="text-xs text-bad">{error}</p> : null}
      {trimChanged ? <p role="status" className="text-[11px] text-fg-muted">The trim changed. Analyze movement again to use this part of the clip.</p> : null}

      {analysable ? (
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="dsp text-[10px] tracking-[0.17em] text-fg-subtle">Read the swing</p>
              <p className="mt-1 text-[11px] leading-[1.5] text-fg-muted">
                {!crossOrigin
                  ? "This video will play but cannot be read, because its storage does not allow it."
                  : (progress ??
                    "Tracks visible joints on the original video and analyses their movement. Select the camera view below, trim to one complete swing and keep your whole body visible. The first read downloads the body tracker (about 30 MB).")}
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
              {analysing ? "Tracking" : "Analyze movement"}
            </Button>
          </div>
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
          <label className="mt-3 block text-[11px] text-fg-muted">
            Camera view
            <select aria-label="Camera view for movement analysis" value={view} disabled={analysing} onChange={(event) => setView(event.target.value as MotionView)} className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[12px]">
              <option value="face_on">Face on</option>
              <option value="down_the_line">Down the line</option>
              <option value="other">Other / unsure</option>
            </select>
          </label>
        </div>
      ) : null}

      {trimmable ? (
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <p className="dsp text-[10px] tracking-[0.17em] text-fg-subtle">Edit length</p>
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
            Saved with the swing, so the same trim plays on every device.
          </p>
        </div>
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

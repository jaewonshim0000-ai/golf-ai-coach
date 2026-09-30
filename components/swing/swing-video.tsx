"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Video } from "lucide-react";

import { useRouter } from "next/navigation";

import {
  analyzeSwingAction,
  savePoseModelAction,
  saveSwingClipAction,
  type AnalyzeState,
} from "@/app/actions";
import { FRAME_COUNT } from "@/lib/ai/vision";
import { LM, packFrames, type Landmark, type PoseFrame } from "@/lib/golf/pose";
import { readSwing } from "@/lib/pose-runner";
import { clampClip, clipWindow, getClip } from "@/lib/video-store";
import { cn } from "@/lib/utils";
import { browserClient } from "@/lib/db/supabase";
import { Button } from "@/components/ui/primitives";

type TrackingPreview = { image: string; landmarks: Landmark[]; time: number };

const TRACKED_BONES: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, 13], [13, LM.leftWrist],
  [LM.rightShoulder, 14], [14, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip], [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee], [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee], [LM.rightKnee, LM.rightAnkle],
  [LM.leftAnkle, LM.leftHeel], [LM.leftHeel, LM.leftFootIndex],
  [LM.rightAnkle, LM.rightHeel], [LM.rightHeel, LM.rightFootIndex],
];

function trackingQuality(frame: PoseFrame): number {
  const points = frame.imageLandmarks ?? [];
  const important = [
    LM.leftShoulder, LM.rightShoulder, LM.leftWrist, LM.rightWrist,
    LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee,
    LM.leftAnkle, LM.rightAnkle,
  ];
  return important.reduce((sum, index) => sum + (points[index]?.visibility ?? 0), 0) / important.length;
}

async function captureTrackingPreview(
  element: HTMLVideoElement,
  frames: PoseFrame[],
): Promise<TrackingPreview | null> {
  const frame = [...frames]
    .filter((item) => item.imageLandmarks?.length === 33)
    .sort((a, b) => trackingQuality(b) - trackingQuality(a))[0];
  if (!frame?.imageLandmarks) return null;
  await seek(element, frame.t);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 560 / element.videoWidth);
  canvas.width = Math.round(element.videoWidth * scale);
  canvas.height = Math.round(element.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(element, 0, 0, canvas.width, canvas.height);
  return {
    image: canvas.toDataURL("image/jpeg", 0.8),
    landmarks: frame.imageLandmarks,
    time: frame.t,
  };
}

function TrackingOverlay({ preview }: { preview: TrackingPreview }) {
  const visible = (point?: Landmark) => Boolean(point && (point.visibility ?? 1) >= 0.55);
  return (
    <div className="mt-3 space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-black">
        {/* Generated locally from the user's video; it never becomes a remote image asset. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview.image} alt="Frame used to verify body tracking" className="block h-auto w-full" />
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          {TRACKED_BONES.map(([from, to]) => {
            const a = preview.landmarks[from];
            const b = preview.landmarks[to];
            if (!visible(a) || !visible(b)) return null;
            const accent =
              (from === LM.leftShoulder && to === LM.rightShoulder) ||
              (from === LM.leftHip && to === LM.rightHip);
            return (
              <line
                key={`${from}-${to}`}
                x1={a!.x} y1={a!.y} x2={b!.x} y2={b!.y}
                stroke={accent ? (from === LM.leftHip ? "#3fc1a5" : "#ff7a59") : "#f8fafc"}
                strokeWidth={accent ? 0.009 : 0.005}
                strokeLinecap="round"
              />
            );
          })}
          {preview.landmarks.map((point, index) =>
            visible(point) ? (
              <circle key={index} cx={point.x} cy={point.y} r={0.008} fill="#e6b85c" />
            ) : null,
          )}
        </svg>
      </div>
      <p className="text-[10.5px] leading-[1.5] text-fg-subtle">
        Tracking check at {preview.time.toFixed(1)}s · orange shoulders · green hips · gold joints.
        If the lines leave your body, shorten the clip or use a brighter face-on/down-the-line view.
      </p>
    </div>
  );
}

/** Seek and wait for the frame to actually be there, or give up on it. */
function seek(element: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      element.removeEventListener("seeked", done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, 2000);
    element.addEventListener("seeked", done);
    element.currentTime = time;
  });
}

/**
 * Connected clips use expiring signed URLs. Older device-local clips and
 * demo recordings load from IndexedDB. Only local clips currently support trim.
 */
export function SwingVideo({
  id,
  videoUrl,
  trimmable = false,
  analysable = false,
  clipStart = null,
  clipEnd = null,
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
  const [analysis, setAnalysis] = useState<AnalyzeState | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [trackingPreview, setTrackingPreview] = useState<TrackingPreview | null>(null);
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

  /**
   * Read the swing.
   *
   * The detector runs on this device and measures the body it finds, which is
   * the real answer and costs nothing per use. It needs a body it can see, so
   * when it cannot find one - too far away, cropped, filmed from behind a net
   * - the six-frame estimate takes over and says that is what it is.
   */
  async function analyse() {
    const element = video.current;
    if (!element || analysing) return;
    setAnalysing(true);
    setAnalysis(null);
    setTrackingPreview(null);
    setProgress("Loading the pose detector");
    const wasTime = element.currentTime;

    try {
      if (!element.videoWidth || !element.videoHeight) {
        throw new Error("The video has not loaded yet.");
      }
      const span: [number, number] = end > start ? [start, end] : [0, element.duration];

      let posed: Awaited<ReturnType<typeof readSwing>> = [];
      try {
        posed = await readSwing(element, span[0], span[1], (done, total) =>
          setProgress(`Looking for your body: ${Math.round((done / total) * 100)}%`),
        );
      } catch {
        // No detector - blocked download, no WebGL, an old browser. The
        // estimate below still works, so this is not the end of the attempt.
        posed = [];
      }

      if (posed.length >= 3) {
        setProgress("Building the 3D model");
        setTrackingPreview(await captureTrackingPreview(element, posed));
        const saved = await savePoseModelAction({
          swing_session_id: id,
          ...packFrames(posed),
          // Picture x and y are fractions of different lengths; the rebuild needs both.
          aspect: element.videoWidth / element.videoHeight,
        });
        // A body with no swing in it falls through to the estimate below;
        // anything else - saved, or a real failure - is the answer.
        if (!saved.noSwing) {
          setAnalysis(saved);
          if (saved.ok) router.refresh();
          return;
        }
      }

      setProgress("No body found; reading the frames instead");
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 448 / element.videoWidth);
      canvas.width = Math.round(element.videoWidth * scale);
      canvas.height = Math.round(element.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot read frames from video.");

      const frames: string[] = [];
      for (let index = 0; index < FRAME_COUNT; index += 1) {
        const at = span[0] + ((span[1] - span[0]) * (index + 0.5)) / FRAME_COUNT;
        await seek(element, at);
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
        if (data) frames.push(data);
      }

      const estimated = await analyzeSwingAction({ swing_session_id: id, frames });
      setAnalysis(estimated);
      if (estimated.ok) router.refresh();
    } catch (error) {
      setAnalysis({
        ok: false,
        message:
          error instanceof Error && error.name === "SecurityError"
            ? "This video could not be read for analysis because of its storage settings."
            : error instanceof Error
              ? error.message
              : "Could not read this video.",
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
      <video
        ref={video}
        src={src}
        crossOrigin={crossOrigin ? "anonymous" : undefined}
        controls={trimmable}
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
        className={cn("w-full rounded-2xl bg-black object-cover", className ?? "aspect-[3/4]")}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          setDuration(element.duration);
          // Park on the first frame of the clip so a card shows the swing, not black.
          element.currentTime = trim[0] ?? 0.05;
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          if (end <= start) return;
          if (element.currentTime > end || element.currentTime < start - 0.3) {
            element.currentTime = start;
          }
        }}
      />
      {error ? <p role="alert" className="text-xs text-bad">{error}</p> : null}

      {analysable ? (
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="dsp text-[10px] tracking-[0.17em] text-fg-subtle">Read the swing</p>
              <p className="mt-1 text-[11px] leading-[1.5] text-fg-muted">
                {!crossOrigin
                  ? "This video will play but cannot be read, because its storage does not allow it."
                  : (progress ??
                    "Tracks 33 joints, rebuilds your body in 3D from what the camera saw, and measures the positions this view can support. Most accurate in slow motion (120 or 240 fps): face on for sway, down the line for turns. The first read downloads about 30 MB.")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void analyse()}
              disabled={analysing || !crossOrigin}
            >
              {analysing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {analysing ? "Reading" : "Measure swing"}
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
          {trackingPreview ? <TrackingOverlay preview={trackingPreview} /> : null}
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

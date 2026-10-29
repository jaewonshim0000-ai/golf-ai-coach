"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Loader2, RotateCcw, Square, X } from "lucide-react";
import { checkFraming, detectView, type Framing } from "@/lib/golf/framing";
import type { MotionView } from "@/lib/golf/motion-analysis";
import { createSwingDetector } from "@/lib/pose-worker-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";

/** Seconds to walk from the phone to address. */
const COUNTDOWN = 5;
/** Setup, swing and finish fit easily; it also keeps the file far under the upload limit. */
const MAX_SECONDS = 12;
/** Below this the browser's video is too coarse to call slow motion. */
const SLOW_MOTION_FPS = 60;
/** MP4 plays everywhere; WebM is Chrome's fallback. */
const RECORDER_TYPES = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

/** A secure page with a camera and a recorder. Otherwise the phone's own camera app records. */
export function canRecordInApp(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

const TIPS: Record<Exclude<MotionView, "other">, string> = {
  face_on: "Face on: phone at hip height, 3–4 m in front of you, facing your chest and level with the ball.",
  down_the_line: "Down the line: phone at hip height, 3–4 m behind you, pointing along your target line through your hands.",
};

/** Where to put the phone and yourself. Shown before recording or uploading. */
export function FilmingGuide() {
  return <div className="space-y-3 rounded-xl bg-info-soft p-3.5 text-[12px] leading-relaxed text-fg-muted">
    <p className="text-[13px] font-semibold text-fg">How to film for the best analysis</p>
    <svg viewBox="0 0 300 120" role="img" aria-label="Seen from above: the face-on phone faces your chest from across the ball; the down-the-line phone stands behind you on the target line." className="w-full text-fg-muted">
      <defs><marker id="guide-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 8 4 0 8z" fill="currentColor" /></marker></defs>
      <line x1="150" y1="64" x2="282" y2="64" stroke="currentColor" strokeDasharray="4 4" markerEnd="url(#guide-arrow)" />
      <text x="282" y="56" fontSize="10" textAnchor="end" fill="currentColor">Target</text>
      <circle cx="150" cy="64" r="3.5" fill="currentColor" />
      <ellipse cx="150" cy="92" rx="15" ry="9" className="fill-accent/25 stroke-accent" />
      <text x="150" y="114" fontSize="10" textAnchor="middle" fill="currentColor">You</text>
      <g className="text-accent">
        <path d="M150 22 136 84 164 84z" className="fill-accent/10" />
        <rect x="141" y="6" width="18" height="12" rx="2.5" fill="currentColor" />
        <text x="166" y="16" fontSize="10" fill="currentColor">Face on</text>
        <path d="M40 79 132 64 132 100z" className="fill-accent/10" />
        <rect x="22" y="73" width="18" height="12" rx="2.5" fill="currentColor" />
        <text x="18" y="102" fontSize="10" fill="currentColor">Down the line</text>
      </g>
    </svg>
    <ul className="list-disc space-y-1.5 pl-4">
      <li><b className="text-fg">Slow motion.</b> Record here, or use your camera app&apos;s Slo-mo (120 or 240 fps) and upload. The speed is detected for you.</li>
      <li><b className="text-fg">Phone on a stand</b> or propped up, held upright and level at hip height, 3–4 m (10–13 ft) away.</li>
      <li><b className="text-fg">Angle.</b> Face on: across the ball, facing your chest. Down the line: behind your hands, along the target line.</li>
      <li><b className="text-fg">Stand in the middle</b> with your whole body in view and space above your head for the club.</li>
      <li><b className="text-fg">One swing.</b> Start 2 seconds before you swing and stop after your finish.</li>
      <li><b className="text-fg">Bright, even light</b> with the sun behind the phone, and only you in the picture.</li>
    </ul>
  </div>;
}

/** A golfer at address where the body should fit, with room for the club above. */
function GolferOutline({ view, ok }: { view: Exclude<MotionView, "other">; ok: boolean }) {
  return <svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMid meet" aria-hidden
    className={cn("pointer-events-none absolute inset-x-[8%] bottom-[6%] top-[12%] h-[82%] w-[84%] fill-none stroke-[2.5] [stroke-linecap:round] [stroke-linejoin:round]", ok ? "stroke-good" : "stroke-white/60")}>
    {view === "face_on" ? <>
      <circle cx="50" cy="24" r="9" />
      <path d="M33 44h34M50 33v8M36 44l-2 40h32l-2-40M34 84l-4 66M66 84l4 66M36 46l12 46M64 46l-12 46M50 92l-6 54" />
      <circle cx="42" cy="149" r="2.5" />
    </> : <>
      <circle cx="58" cy="24" r="9" />
      <path d="M54 34 36 80M54 38l10 52M36 80l8 30-6 40M36 80l-2 30 4 40M64 90l20 56" />
      <circle cx="87" cy="149" r="2.5" />
    </>}
    <path d="M10 153h80" strokeDasharray="4 5" />
  </svg>;
}

type Stage = "starting" | "ready" | "countdown" | "recording" | "review" | "error";

/**
 * Records a swing at the highest frame rate the phone's browser offers, and
 * replays it in slow motion. Browsers do not expose the camera's own Slo-mo
 * mode, so most give 60 fps; the guide points to the camera app for more.
 * Clips play back in real time, and the analysis detects that.
 */
export function SwingCamera({ open, onUse, onClose }: {
  open: boolean; onUse: (file: File, fps: number | null) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timers = useRef<number[]>([]);
  const sound = useRef<AudioContext | null>(null);
  const [stage, setStage] = useState<Stage>("starting");
  const [fps, setFps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [framing, setFraming] = useState<Framing | null>(null);
  const [view, setView] = useState<Exclude<MotionView, "other">>("face_on");
  const [count, setCount] = useState(0);
  const [take, setTake] = useState<{ file: File; url: string } | null>(null);

  const clearTimers = () => { timers.current.forEach((timer) => window.clearTimeout(timer)); timers.current = []; };
  const later = (ms: number, run: () => void) => { timers.current.push(window.setTimeout(run, ms)); };
  const beep = (frequency: number, seconds = 0.12) => {
    const context = sound.current;
    if (!context) return;
    const tone = context.createOscillator();
    tone.frequency.value = frequency;
    tone.connect(context.destination);
    tone.start();
    tone.stop(context.currentTime + seconds);
  };

  // Open: start the rear camera, asking for the fastest frame rate it will give.
  useEffect(() => {
    if (!open) return;
    if (!dialog.current?.open) dialog.current?.showModal();
    let cancelled = false;
    setStage("starting"); setError(null); setFraming(null); setTake(null); setFps(null);
    (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // Frame rate matters more than pixels: the body model reads a small image anyway.
          video: { facingMode: { ideal: "environment" }, frameRate: { ideal: 240 }, height: { ideal: 720 } },
        });
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream.current = media;
        const track = media.getVideoTracks()[0]!;
        const highest = track.getCapabilities?.().frameRate?.max;
        if (highest && highest > (track.getSettings().frameRate ?? 0)) {
          // Many phones only reach their top rate at a lower resolution; let it drop.
          await track.applyConstraints({ frameRate: { min: highest } })
            .catch(() => track.applyConstraints({ frameRate: { ideal: highest } })).catch(() => undefined);
        }
        setFps(Math.round(track.getSettings().frameRate ?? 0) || null);
        if (live.current) { live.current.srcObject = media; await live.current.play().catch(() => undefined); }
        setStage("ready");
      } catch (cause) {
        if (cancelled) return;
        const name = cause instanceof DOMException ? cause.name : "";
        setError(name === "NotAllowedError" ? "Camera access was declined. Allow the camera for this site in your browser settings, or upload a video instead."
          : name === "NotFoundError" ? "No camera was found on this device. Upload a video instead."
            : "The camera could not start. Close other apps using it and try again, or upload a video instead.");
        setStage("error");
      }
    })();
    return () => {
      cancelled = true;
      clearTimers();
      if (recorder.current?.state === "recording") { recorder.current.onstop = null; recorder.current.stop(); }
      recorder.current = null;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      void sound.current?.close().catch(() => undefined);
      sound.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => () => { if (take) URL.revokeObjectURL(take.url); }, [take]);

  // While aiming, check the framing and the view about once a second. Stops while recording.
  useEffect(() => {
    if (stage !== "ready") return;
    const run = new AbortController();
    const detector = createSwingDetector(run.signal);
    let timer = 0;
    const check = async () => {
      const video = live.current;
      if (run.signal.aborted || !video || video.readyState < 2) { timer = window.setTimeout(check, 500); return; }
      try {
        const result = await detector.detect(video);
        if (run.signal.aborted) return;
        setFraming(checkFraming(result.landmarks));
        const seen = detectView(result.landmarks, video.videoWidth / video.videoHeight);
        if (seen) setView(seen);
      } catch {
        if (!run.signal.aborted) setFraming(null);
        return; // No framing help on this device; recording still works.
      }
      if (!run.signal.aborted) timer = window.setTimeout(check, 900);
    };
    void check();
    return () => { run.abort(); detector.close(); window.clearTimeout(timer); };
  }, [stage]);

  function record() {
    const media = stream.current;
    if (!media) return;
    // Created on the tap, because phones only allow sound that starts from a gesture.
    try { sound.current ??= new AudioContext(); void sound.current.resume(); } catch { /* Silent countdown. */ }
    setStage("countdown");
    for (let left = COUNTDOWN; left > 0; left--) {
      later((COUNTDOWN - left) * 1000, () => { setCount(left); beep(660); });
    }
    later(COUNTDOWN * 1000, () => {
      const mimeType = RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const chunks: Blob[] = [];
      let next: MediaRecorder;
      try { next = new MediaRecorder(media, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 8_000_000 }); }
      catch { setError("This browser cannot record video. Upload a video instead."); setStage("error"); return; }
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        const type = (next.mimeType || mimeType || "video/webm").split(";")[0]!;
        const blob = new Blob(chunks, { type });
        if (!blob.size) { setError("Nothing was recorded. Try again."); setStage("ready"); return; }
        const file = new File([blob], `swing-${new Date().toISOString().replace(/[:.]/g, "-")}.${type === "video/mp4" ? "mp4" : "webm"}`, { type });
        setTake({ file, url: URL.createObjectURL(file) });
        setStage("review");
        beep(440, 0.25);
      };
      recorder.current = next;
      next.start(1000);
      setCount(0);
      setStage("recording");
      beep(990, 0.3);
      for (let second = 1; second <= MAX_SECONDS; second++) later(second * 1000, () => setCount(second));
      later(MAX_SECONDS * 1000, stop);
    });
  }

  function stop() {
    clearTimers();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function retake() {
    setTake(null);
    setFraming(null);
    setStage("ready");
  }

  const slow = fps !== null && fps >= SLOW_MOTION_FPS;

  return (
    <dialog ref={dialog} aria-label="Record your swing" onClose={onClose} onCancel={(event) => { if (stage === "recording") event.preventDefault(); }}
      className="m-0 h-[100svh] max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black">
      <div className="relative flex h-full flex-col">
        <div className="relative min-h-0 flex-1">
          <video ref={live} playsInline muted autoPlay className={cn("absolute inset-0 h-full w-full object-contain", take && "hidden")} />
          {/* Real-speed recording, watched in slow motion. */}
          {take ? <video src={take.url} playsInline controls autoPlay loop muted className="absolute inset-0 h-full w-full object-contain"
            onLoadedMetadata={(event) => { event.currentTarget.defaultPlaybackRate = event.currentTarget.playbackRate = 0.25; }} /> : null}
          {!take && stage !== "error" ? <GolferOutline view={view} ok={Boolean(framing?.ok)} /> : null}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
            <div className="space-y-1.5">
              {fps ? <p className="w-fit rounded-full bg-black/60 px-2.5 py-1 text-[11px] tabular-nums">{slow ? `Slow motion · ${fps} fps` : `${fps} fps`}</p> : null}
              {stage === "ready" && framing ? (
                <p role="status" className={cn("max-w-[260px] rounded-lg px-2.5 py-1.5 text-[12px] leading-snug", framing.ok ? "bg-good text-white" : "bg-black/70")}>{framing.message}</p>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Close camera" className="text-white hover:bg-white/10"
              disabled={stage === "recording"} onClick={() => dialog.current?.close()}><X className="h-5 w-5" /></Button>
          </div>
          {stage === "countdown" ? <p role="status" className="absolute inset-0 flex items-center justify-center text-[96px] font-semibold tabular-nums drop-shadow">{count}</p> : null}
          {stage === "recording" ? (
            <p role="status" className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[13px] tabular-nums">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-bad" /> Recording {count}s / {MAX_SECONDS}s
            </p>
          ) : null}
          {stage === "starting" ? <p role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-[13px]"><Loader2 className="h-4 w-4 animate-spin" /> Starting the camera</p> : null}
          {stage === "error" ? <p role="alert" className="absolute inset-x-6 top-1/3 rounded-xl bg-black/70 p-4 text-center text-[13px] leading-relaxed">{error}</p> : null}
        </div>
        <div className="space-y-3 bg-black px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {stage === "ready" ? <div className="space-y-1.5 text-center text-[12px] leading-relaxed text-white/75">
            <p>{TIPS[view]} Fit yourself inside the outline, with the phone on a stand.</p>
            <p>Tap record, walk to the ball and swing after the beeps. It stops by itself after {MAX_SECONDS} seconds.</p>
            {fps && !slow ? <p className="text-white/60">This browser films at {fps} fps. For smoother slow motion, use your camera app&apos;s Slo-mo and upload the video.</p> : null}
          </div> : null}
          {stage === "review" ? <p className="text-center text-[12px] text-white/75">Playing at quarter speed. Check the whole swing is in the clip.</p> : null}
          <div className="flex items-center justify-center gap-3">
            {stage === "ready" ? <Button type="button" size="lg" onClick={record}><Circle className="h-4 w-4 fill-current" /> Record</Button> : null}
            {stage === "countdown" ? <Button type="button" variant="secondary" onClick={() => { clearTimers(); setStage("ready"); }}>Cancel</Button> : null}
            {stage === "recording" ? <Button type="button" variant="danger" size="lg" onClick={stop}><Square className="h-4 w-4 fill-current" /> Stop</Button> : null}
            {stage === "review" && take ? <>
              <Button type="button" variant="secondary" onClick={retake}><RotateCcw className="h-4 w-4" /> Retake</Button>
              <Button type="button" size="lg" onClick={() => { onUse(take.file, fps); dialog.current?.close(); }}>Use this video</Button>
            </> : null}
            {stage === "error" ? <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>Close</Button> : null}
          </div>
        </div>
      </div>
    </dialog>
  );
}

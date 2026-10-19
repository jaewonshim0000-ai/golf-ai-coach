"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Loader2, RotateCcw, Square, X } from "lucide-react";
import { checkFraming, type Framing } from "@/lib/golf/framing";
import type { MotionView } from "@/lib/golf/motion-analysis";
import { createSwingDetector } from "@/lib/pose-worker-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";

/** Seconds to walk from the phone to address. */
const COUNTDOWN = 5;
/** Setup, swing and finish fit easily; it also keeps the file far under the upload limit. */
const MAX_SECONDS = 12;
/** MP4 plays everywhere; WebM is Chrome's fallback. */
const RECORDER_TYPES = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

/** A secure page with a camera and a recorder. Otherwise the phone's own camera app records. */
export function canRecordInApp(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

type Stage = "starting" | "ready" | "countdown" | "recording" | "review" | "error";

/**
 * Records a swing in the browser at the highest frame rate the phone's browser
 * offers (often 30–60 fps; browsers do not expose the camera's slow-motion
 * mode). Clips play back in real time, so the analysis treats them as real speed.
 */
export function SwingCamera({ open, view, onUse, onClose }: {
  open: boolean; view: MotionView; onUse: (file: File, fps: number | null) => void; onClose: () => void;
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
          await track.applyConstraints({ frameRate: { ideal: highest } }).catch(() => undefined);
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

  // While aiming, check the framing about once a second. Stops while recording.
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
        if (!run.signal.aborted) setFraming(checkFraming(result.landmarks));
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

  const tip = view === "down_the_line"
    ? "Phone behind you at hand height, pointing along your target line."
    : "Phone at hip height facing your chest, with the ball in the middle of the picture.";

  return (
    <dialog ref={dialog} aria-label="Record your swing" onClose={onClose} onCancel={(event) => { if (stage === "recording") event.preventDefault(); }}
      className="m-0 h-[100svh] max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black">
      <div className="relative flex h-full flex-col">
        <div className="relative min-h-0 flex-1">
          <video ref={live} playsInline muted autoPlay className={cn("absolute inset-0 h-full w-full object-contain", take && "hidden")} />
          {take ? <video src={take.url} playsInline controls autoPlay loop className="absolute inset-0 h-full w-full object-contain" /> : null}
          {!take && stage !== "error" ? (
            // Where the whole body and the club should fit.
            <div aria-hidden className={cn("pointer-events-none absolute inset-x-[12%] bottom-[4%] top-[10%] rounded-3xl border-2 border-dashed",
              framing?.ok ? "border-good" : "border-white/50")} />
          ) : null}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
            <div className="space-y-1.5">
              {fps ? <p className="w-fit rounded-full bg-black/60 px-2.5 py-1 text-[11px] tabular-nums">{fps} fps</p> : null}
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
          {stage === "ready" ? <p className="text-center text-[12px] leading-relaxed text-white/75">{tip} Tap record, walk to the ball and swing after the beeps. It stops by itself after {MAX_SECONDS} seconds.</p> : null}
          {stage === "review" ? <p className="text-center text-[12px] text-white/75">Check the whole swing is in the clip.</p> : null}
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

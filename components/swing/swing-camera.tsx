"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Upload, X } from "lucide-react";
import { checkFraming, detectView, type Framing } from "@/lib/golf/framing";
import type { MotionView } from "@/lib/golf/motion-analysis";
import { createSwingDetector } from "@/lib/pose-worker-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";

/** Walk from the phone to the ball, set up, swing and finish; still far under the upload limit. */
const MAX_SECONDS = 17;
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

type Stage = "starting" | "ready" | "recording" | "review" | "error";

/**
 * Records a swing at the highest frame rate the phone's browser offers, and
 * replays it in slow motion. Browsers do not expose the camera's own Slo-mo
 * mode, so most give 60 fps; the guide points to the camera app for more.
 * Clips play back in real time, and the analysis detects that.
 */
export function SwingCamera({ open, onUse, onClose, onUpload }: {
  open: boolean; onUse: (file: File, fps: number | null) => void; onClose: () => void;
  /** Close the camera and pick a file instead. */
  onUpload?: () => void;
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
    try { sound.current ??= new AudioContext(); void sound.current.resume(); } catch { /* Record without beeps. */ }
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
      className="m-0 h-[100svh] max-h-none w-screen max-w-none bg-[linear-gradient(180deg,#1f2a16,#26341b_62%,#2e3f20)] p-0 text-white backdrop:bg-black">
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <button type="button" aria-label="Close camera" disabled={stage === "recording"} onClick={() => dialog.current?.close()}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.12] disabled:opacity-40">
            <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
          <div role="radiogroup" aria-label="Camera angle" className="flex rounded-full bg-white/[0.12] p-1">
            {(["face_on", "down_the_line"] as const).map((option) => (
              <button key={option} type="button" role="radio" aria-checked={view === option} disabled={stage === "recording"}
                onClick={() => setView(option)}
                className={cn("dsp h-9 rounded-full px-3.5 text-[10px]", view === option ? "bg-accent text-white" : "text-white/85")}>
                {option === "face_on" ? "Face on" : "Down the line"}
              </button>
            ))}
          </div>
          <span className="w-11" aria-hidden />
        </div>

        <h2 className="dsp mt-5 text-center text-[24px] leading-none">
          {stage === "review" ? "Check your swing" : stage === "recording" ? `Recording ${count}s / ${MAX_SECONDS}s` : "Stand inside the frame"}
        </h2>

        <div className="relative mx-auto mt-4 min-h-0 w-[min(100%-2.5rem,420px)] flex-1 overflow-hidden rounded-[28px] border-[1.5px] border-dashed border-white/45">
          <video ref={live} playsInline muted autoPlay className={cn("absolute inset-0 h-full w-full object-cover", take && "hidden")} />
          {/* Real-speed recording, watched in slow motion. */}
          {take ? <video src={take.url} playsInline controls autoPlay loop muted className="absolute inset-0 h-full w-full object-contain"
            onLoadedMetadata={(event) => { event.currentTarget.defaultPlaybackRate = event.currentTarget.playbackRate = 0.25; }} /> : null}
          {!take && stage !== "error" ? <GolferOutline view={view} ok={Boolean(framing?.ok)} /> : null}
          {!take && stage !== "error" ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-end gap-2 px-4">
              <span className="h-px flex-1 bg-white/70" />
              <span className="dsp text-[10px] text-white/80">Target</span>
            </div>
          ) : null}
          <div className="absolute inset-x-0 top-0 flex flex-col items-start gap-1.5 p-3">
            {fps ? <p className="w-fit rounded-full bg-black/50 px-2.5 py-1 text-[11px] tabular-nums">{slow ? `Slow motion · ${fps} fps` : `${fps} fps`}</p> : null}
            {stage === "ready" && framing ? (
              <p role="status" className={cn("max-w-[260px] rounded-xl px-2.5 py-1.5 text-[12px] leading-snug", framing.ok ? "bg-accent text-white" : "bg-black/60")}>{framing.message}</p>
            ) : null}
          </div>
          {stage === "starting" ? <p role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-[13px]"><Loader2 className="h-4 w-4 animate-spin" /> Starting the camera</p> : null}
          {stage === "error" ? <p role="alert" className="absolute inset-x-5 top-1/3 rounded-2xl bg-black/60 p-4 text-center text-[13px] leading-relaxed">{error}</p> : null}
        </div>

        <div className="flex flex-col gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          {stage === "ready" || stage === "starting" ? (
            <div className="flex flex-wrap justify-center gap-1.5 text-[12px] font-semibold">
              {["Phone on a stand", "Even light", "One swing"].map((tip) => (
                <span key={tip} className="rounded-full bg-white/[0.12] px-3 py-1.5">{tip}</span>
              ))}
            </div>
          ) : stage === "review" ? (
            <p className="text-center text-[12px] text-white/75">Playing at quarter speed. Check the whole swing is in the clip.</p>
          ) : null}
          {stage === "ready" ? <p className="text-center text-[12px] leading-relaxed text-white/70">{TIPS[view]} Recording starts as soon as you tap: walk to the ball and swing. It stops after {MAX_SECONDS} seconds.</p> : null}

          {stage === "review" && take ? (
            <div className="flex gap-2.5">
              <Button type="button" variant="secondary" className="h-14 flex-1 border-white bg-transparent text-white hover:bg-white/10" onClick={retake}><RotateCcw className="h-4 w-4" /> Retake</Button>
              <Button type="button" className="h-14 flex-1 text-[13px]" onClick={() => { onUse(take.file, fps); dialog.current?.close(); }}>Use this video</Button>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center">
              <div>
                {onUpload && stage !== "recording" ? (
                  <button type="button" aria-label="Upload a video instead" onClick={() => { dialog.current?.close(); onUpload(); }}
                    className="press flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-white/[0.12]">
                    <Upload className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
              <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full bg-[rgb(232_197_71_/_0.12)]">
                {stage === "recording" ? (
                  <button type="button" aria-label="Stop recording" onClick={stop}
                    className="press flex h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-white">
                    <span className="h-8 w-8 rounded-lg bg-[#d9442b]" />
                  </button>
                ) : (
                  <button type="button" aria-label="Start recording" disabled={stage !== "ready"} onClick={record}
                    className="press flex h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-white disabled:opacity-40">
                    <span className="h-16 w-16 rounded-full bg-[#d9442b]" />
                  </button>
                )}
              </div>
              <div className="flex justify-end">
                {slow ? (
                  <span aria-label="Slow motion on" className="font-display flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gold text-[17px] text-[#1e211b]">
                    ¼×
                  </span>
                ) : null}
              </div>
            </div>
          )}
          {stage === "error" ? <Button type="button" variant="secondary" className="border-white text-white" onClick={() => dialog.current?.close()}>Close</Button> : null}
        </div>
      </div>
    </dialog>
  );
}

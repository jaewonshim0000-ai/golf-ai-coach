"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Video } from "lucide-react";

import { analyzeSwingAction, type AnalyzeState } from "@/app/actions";
import { FRAME_COUNT } from "@/lib/ai/vision";
import { clampClip, clipWindow, getClip, putClip, type Clip } from "@/lib/video-store";
import { cn } from "@/lib/utils";
import { browserClient } from "@/lib/db/supabase";
import { Button } from "@/components/ui/primitives";

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
  className,
}: {
  id: string;
  videoUrl: string | null;
  trimmable?: boolean;
  /** Show the frame-analysis control under the player. */
  analysable?: boolean;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const remote = videoUrl?.startsWith("supabase://swing-videos/") ? videoUrl.slice("supabase://swing-videos/".length) : null;
  const clipId = videoUrl?.startsWith("local://clip/") ? videoUrl.slice("local://clip/".length) : id;
  const [src, setSrc] = useState<string | null>(videoUrl?.startsWith("https://") ? videoUrl : null);
  const [error, setError] = useState<string | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [duration, setDuration] = useState(0);
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeState | null>(null);
  const [analysing, setAnalysing] = useState(false);

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
        setClip(found);
      })
      // No IndexedDB (private window, storage blocked): fall back to the URL.
      .catch(() => undefined);
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, clipId, remote]);

  const [start, end] = draft ?? clipWindow(clip, duration);

  /*
    Sample the clip evenly rather than guessing where the top of the swing is:
    the model is told the frames are in order and works out the positions
    itself, which is more robust than timing assumptions that only hold for a
    clip trimmed exactly to the swing.
  */
  async function analyse() {
    const element = video.current;
    if (!element || analysing) return;
    setAnalysing(true);
    setAnalysis(null);
    const wasTime = element.currentTime;
    try {
      const width = element.videoWidth;
      const height = element.videoHeight;
      if (!width || !height) throw new Error("The video has not loaded yet.");

      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 448 / width);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot read frames from video.");

      const span = end > start ? [start, end] : [0, element.duration];
      const frames: string[] = [];
      for (let index = 0; index < FRAME_COUNT; index += 1) {
        const at = span[0]! + ((span[1]! - span[0]!) * (index + 0.5)) / FRAME_COUNT;
        await seek(element, at);
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
        if (data) frames.push(data);
      }

      setAnalysis(await analyzeSwingAction({ swing_session_id: id, frames }));
    } catch (error) {
      setAnalysis({
        ok: false,
        message:
          error instanceof Error && error.name === "SecurityError"
            ? "This video could not be read for analysis because of its storage settings."
            : error instanceof Error
              ? error.message
              : "Could not read frames from this video.",
      });
    } finally {
      element.currentTime = wasTime;
      setAnalysing(false);
    }
  }

  async function saveTrim(next: [number, number]) {
    if (!clip) return;
    const [lo, hi] = clampClip(next[0], next[1], duration);
    const updated = { ...clip, start: lo, end: hi };
    try {
      await putClip(updated);
      setClip(updated);
      setDraft(null);
      setError(null);
    } catch { setError("Could not save the trim. Please try again."); }
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
        crossOrigin="anonymous"
        controls={trimmable}
        muted={!trimmable}
        playsInline
        preload="metadata"
        onError={() => setError("This browser could not play the video. Try an MP4 export of your clip.")}
        className={cn("w-full rounded-2xl bg-black object-cover", className ?? "aspect-[3/4]")}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          setDuration(element.duration);
          // Park on the first frame of the clip so a card shows the swing, not black.
          element.currentTime = clip?.start ?? 0.05;
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
                {FRAME_COUNT} frames, estimated by eye. Not a measurement.
              </p>
            </div>
            <Button type="button" size="sm" onClick={() => void analyse()} disabled={analysing}>
              {analysing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {analysing ? "Reading" : "Analyse"}
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
        </div>
      ) : null}

      {trimmable && clip ? (
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
            Clip and trim are stored on this device only.
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

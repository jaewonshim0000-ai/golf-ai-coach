"use client";

import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";

import { clampClip, clipWindow, getClip, putClip, type Clip } from "@/lib/video-store";
import { cn } from "@/lib/utils";

/**
 * A swing clip. The file lives in IndexedDB on this device, so the player has
 * to load it client-side; a remote `video_url` on the row plays instead when
 * there is no local copy, and neither one means a placeholder rather than a
 * broken frame.
 */
export function SwingVideo({
  id,
  videoUrl,
  trimmable = false,
  className,
}: {
  id: string;
  videoUrl: string | null;
  trimmable?: boolean;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(videoUrl);
  const [clip, setClip] = useState<Clip | null>(null);
  const [duration, setDuration] = useState(0);
  const [draft, setDraft] = useState<[number, number] | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let live = true;
    getClip(id)
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
  }, [id]);

  const [start, end] = draft ?? clipWindow(clip, duration);

  async function saveTrim(next: [number, number]) {
    if (!clip) return;
    const [lo, hi] = clampClip(next[0], next[1], duration);
    const updated = { ...clip, start: lo, end: hi };
    setClip(updated);
    setDraft(null);
    await putClip(updated).catch(() => undefined);
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
        <span className="sr-only">No video for this swing</span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <video
        ref={video}
        src={src}
        controls={trimmable}
        muted={!trimmable}
        playsInline
        preload="metadata"
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

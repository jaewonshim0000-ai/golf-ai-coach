"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type PhaseStop = { label: string; at: number };

/**
 * The design's dark strip of swing phases: address, top, impact and finish,
 * each with its time from address. Tapping one shows that frame in the player;
 * the one nearest the playhead is lit.
 */
export function PhaseStrip({ stops, slowMotion }: { stops: PhaseStop[]; slowMotion: number }) {
  const [current, setCurrent] = useState(1);

  useEffect(() => {
    const video = document.querySelector<HTMLVideoElement>("video[data-swing-player]");
    if (!video) return;
    const update = () => {
      let nearest = 0;
      stops.forEach((stop, index) => {
        if (Math.abs(stop.at - video.currentTime) < Math.abs(stops[nearest]!.at - video.currentTime)) nearest = index;
      });
      setCurrent(nearest);
    };
    video.addEventListener("timeupdate", update);
    video.addEventListener("seeked", update);
    return () => {
      video.removeEventListener("timeupdate", update);
      video.removeEventListener("seeked", update);
    };
  }, [stops]);

  const start = stops[0]?.at ?? 0;
  return (
    <div role="group" aria-label="Swing phase" className="grid grid-cols-4 gap-2 rounded-[28px] bg-ink p-2.5">
      {stops.map((stop, index) => {
        const lit = index === current;
        const before = index < current;
        return (
          <button
            key={stop.label}
            type="button"
            aria-pressed={lit}
            onClick={() => {
              const video = document.querySelector<HTMLVideoElement>("video[data-swing-player]");
              if (!video) return;
              video.pause();
              video.currentTime = stop.at;
              setCurrent(index);
            }}
            className={cn(
              "press flex aspect-square min-w-0 flex-col items-center justify-center rounded-full leading-none",
              lit ? "step-now bg-accent text-white" : before ? "bg-[#3a3f33] text-[#e8c547]" : "bg-white text-[#1e211b]",
            )}
          >
            <span className="font-display tabular text-[20px]">{((stop.at - start) / slowMotion).toFixed(2)}</span>
            <span className={cn("mt-1 text-[9px] font-bold uppercase tracking-[0.06em]", before && "text-[#c9ccbf]")}>{stop.label}</span>
          </button>
        );
      })}
    </div>
  );
}

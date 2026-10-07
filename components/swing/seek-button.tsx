"use client";

export function SwingSeekButton({ time }: { time: number }) {
  return <button type="button" className="mt-2 min-h-10 text-[12px] font-medium text-accent" onClick={() => {
    const video = document.querySelector<HTMLVideoElement>("video[data-swing-player]");
    if (!video || !Number.isFinite(video.duration)) return;
    video.pause();
    video.currentTime = Math.min(video.duration, Math.max(0, time));
    window.dispatchEvent(new Event("swing:review"));
  }}>Review at {time.toFixed(2)}s</button>;
}

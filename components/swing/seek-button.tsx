"use client";

/** The swing player, and how many times slower than life it plays. */
export function swingPlayer(): { video: HTMLVideoElement; slowMotion: number } | null {
  const video = document.querySelector<HTMLVideoElement>("video[data-swing-player]");
  return video ? { video, slowMotion: Number(video.dataset.slowMotion) || 1 } : null;
}

/** Show the frame at a real swing time. Analysis times are real seconds; the video may be slow motion. */
export function seekSwing(time: number): HTMLVideoElement | null {
  const player = swingPlayer();
  if (!player || !Number.isFinite(player.video.duration)) return null;
  player.video.pause();
  player.video.currentTime = Math.min(player.video.duration, Math.max(0, time * player.slowMotion));
  return player.video;
}

export function SwingSeekButton({ time }: { time: number }) {
  return <button type="button" className="mt-2 min-h-10 text-[12px] font-medium text-accent" onClick={() => {
    if (seekSwing(time)) window.dispatchEvent(new Event("swing:review"));
  }}>Review this frame</button>;
}

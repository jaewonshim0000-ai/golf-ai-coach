"use client";

import { createVideoPoseLandmarker } from "../pose-detector";
import type { GppLandmark } from "./phases";
import { MAX_FRAMES, golfPoseProResult } from "./result";
const DEADLINE_MS = 6 * 60 * 1000;

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, meta: { mediaTime: number }) => void) => number;
};

/**
 * Browsers do not report a video's frame rate. Play a moment muted and take
 * the smallest step between decoded frames; a busy page can skip frames but
 * cannot make two frames closer than one frame apart.
 */
async function frameRate(video: FrameVideo): Promise<number> {
  if (!video.requestVideoFrameCallback) return 30;
  const times: number[] = [], wasMuted = video.muted;
  video.muted = true;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2500);
    const next = (_: number, meta: { mediaTime: number }) => {
      times.push(meta.mediaTime);
      if (times.length < 16) video.requestVideoFrameCallback!(next); else { clearTimeout(timer); resolve(); }
    };
    video.requestVideoFrameCallback!(next);
    video.play().catch(() => { clearTimeout(timer); resolve(); });
  });
  video.pause();
  video.muted = wasMuted;
  const gaps = times.slice(1).map((time, n) => time - times[n]!).filter((gap) => gap > 0.001);
  return gaps.length ? Math.round(1 / Math.min(...gaps)) : 30;
}

function seekTo(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener("seeked", done); signal?.removeEventListener("abort", abort); };
    const done = () => { cleanup(); resolve(); };
    const abort = () => { cleanup(); reject(signal?.reason ?? new DOMException("Analysis cancelled.", "AbortError")); };
    const timer = setTimeout(done, 3000);
    video.addEventListener("seeked", done);
    signal?.addEventListener("abort", abort);
    video.currentTime = time;
  });
}

/**
 * GolfPosePro's extract_pose_features_debug in the browser: every frame of
 * the clip, in order, through MediaPipe Pose Full in tracking mode. Then the
 * notebook's phase detection on the wrist heights.
 */
export async function captureGolfPosePro(video: HTMLVideoElement, from: number, to: number,
  onProgress?: (done: number, total: number) => void, signal?: AbortSignal) {
  const began = performance.now(), wasTime = video.currentTime;
  const fps = await frameRate(video);
  const first = Math.max(0, Math.round(from * fps)), count = Math.floor(to * fps - 0.5) - first + 1;
  if (count < 10) throw new Error("This video is too short to contain a swing.");
  if (count > MAX_FRAMES) throw new Error(`This clip has ${count} frames; up to ${MAX_FRAMES} (about a minute) can be read. Record one swing and try again.`);
  let delegate: "GPU" | "CPU" = "GPU";
  let landmarker = await createVideoPoseLandmarker("GPU").catch(() => { delegate = "CPU"; return createVideoPoseLandmarker("CPU"); });
  const poses: (GppLandmark[] | null)[] = [];
  video.pause();
  try {
    for (let frame = 0; frame < count; frame++) {
      signal?.throwIfAborted();
      if (performance.now() - began > DEADLINE_MS) throw new Error("Reading this video took too long on this device. Record a shorter clip and try again.");
      await seekTo(video, (first + frame + 0.5) / fps, signal);
      const timestamp = Math.round(frame * 1000 / fps);
      let detection;
      try { detection = landmarker.detectForVideo(video, timestamp); }
      catch (error) {
        if (delegate === "CPU") throw error;
        // The GPU was lost mid-clip; carry on with the same model on the CPU.
        landmarker.close();
        delegate = "CPU";
        landmarker = await createVideoPoseLandmarker("CPU");
        detection = landmarker.detectForVideo(video, timestamp);
      }
      poses.push(detection.landmarks[0]?.map(({ x, y, visibility }) => ({ x, y, visibility: visibility ?? 0 })) ?? null);
      onProgress?.(frame + 1, count);
    }
  } finally {
    landmarker.close();
    video.currentTime = wasTime;
  }
  return { fps, analysed: golfPoseProResult(poses, fps, video.videoWidth, video.videoHeight, first) };
}

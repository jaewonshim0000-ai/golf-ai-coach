"use client";

import { findImagePhases, smoothFrames, type PoseFrame } from "./golf/pose";

/**
 * Running the pose detector over a swing, in the browser.
 *
 * The detection happens on the player's own device: the video never leaves it,
 * there is no per-use cost, and it works without an API key. What leaves the
 * device afterwards is thirty-three points per frame, which is what the
 * measurements are computed from.
 *
 * ponytail: the model and the wasm come from the public CDNs MediaPipe
 * publishes them on, so there is no build step and no binary in the repo. They
 * are fetched once and then cached by the browser. Self-hosting is a change of
 * these two constants plus copying `node_modules/@mediapipe/tasks-vision/wasm`
 * into `public/`; worth doing if the app ever needs to work offline.
 */

const VERSION = "1.0.1";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
/*
  The heavy model rather than full or lite: the 3D model is only as good as
  the depth the detector infers, so this deliberately spends more download
  size and processing time for the best model Google ships for this task.
*/
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";

/**
 * How many frames to sample across the swing.
 *
 * The downswing takes about a quarter of a second, so impact is a narrow
 * target. Short clips start at 64 samples and longer clips scale to 120;
 * trimming still produces the tightest spacing and most accurate phases.
 */
export const POSE_SAMPLES = 64;
/** The first pass stops here, leaving room for the downswing pass. */
const COARSE_SAMPLES_MAX = 96;
/** What the server accepts in one model. */
const MAX_POSE_SAMPLES = 128;
/**
 * Samples a second of video time through the downswing. A 30 or 60 fps clip
 * has fewer real frames than this and the repeats are skipped; a slow-motion
 * clip has more, and this is where they pay off.
 */
const DENSE_RATE = 120;

type DetectedLandmark = { x: number; y: number; z: number; visibility?: number };

type Landmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number,
  ) => { worldLandmarks: DetectedLandmark[][]; landmarks: DetectedLandmark[][] };
  close: () => void;
};

let cached: Promise<Landmarker> | null = null;
let lastVideoTimestamp = -1;

/**
 * MediaPipe keeps timestamp state inside a cached graph, so a second analysis
 * cannot restart at zero. The browser clock also survives hot reloads; the
 * previous value is the guard for multiple frames read within one millisecond.
 */
export function nextVideoTimestamp(now = performance.now()): number {
  lastVideoTimestamp = Math.max(lastVideoTimestamp + 1, Math.floor(now));
  return lastVideoTimestamp;
}

async function loadLandmarker(): Promise<Landmarker> {
  if (!cached) {
    cached = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return (await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.65,
        minPosePresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
      })) as unknown as Landmarker;
    })().catch((error) => {
      // A failed load must not poison every later attempt.
      cached = null;
      throw error;
    });
  }
  return cached;
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, meta: { mediaTime: number }) => void) => number;
};

/**
 * Seek and wait for the frame to be there, or give up on that sample.
 * Resolves with the time of the frame actually on screen: a seek lands on the
 * nearest real frame, not the time asked for, and the analysis should know
 * which moment it is looking at. Browsers without frame callbacks fall back
 * to the requested time.
 */
function seek(video: FrameCallbackVideo, time: number): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (at: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve(at);
    };
    const timer = window.setTimeout(() => finish(video.currentTime), 2000);
    const onSeeked = () => {
      if (!video.requestVideoFrameCallback) return finish(video.currentTime);
      const fallback = window.setTimeout(() => finish(video.currentTime), 150);
      video.requestVideoFrameCallback((_, meta) => {
        window.clearTimeout(fallback);
        finish(meta.mediaTime);
      });
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

export type PoseProgress = (done: number, total: number) => void;

/**
 * Walk the clip and return one skeleton per sample. Frames where no body was
 * found are dropped rather than filled in, so a clip that only shows a player
 * for part of its length still yields the part it does show.
 */
export async function readSwing(
  video: HTMLVideoElement,
  from: number,
  to: number,
  onProgress?: PoseProgress,
): Promise<PoseFrame[]> {
  const landmarker = await loadLandmarker();
  const span = to > from ? to - from : video.duration;
  const start = to > from ? from : 0;
  if (!Number.isFinite(span) || span <= 0) return [];

  const wasTime = video.currentTime;
  const wasPaused = video.paused;
  video.pause();

  const frames: PoseFrame[] = [];
  const seenFrames = new Set<number>();
  /** Detect the body at one moment; false when that video frame was already read. */
  const readAt = async (time: number) => {
    const t = await seek(video, time);
    const key = Math.round(t * 1000);
    if (seenFrames.has(key)) return;
    seenFrames.add(key);
    // The graph is cached across measurements, so this must remain strictly
    // increasing across separate runs as well as within this loop.
    const result = landmarker.detectForVideo(video, nextVideoTimestamp());
    const landmarks = result.worldLandmarks?.[0];
    const imageLandmarks = result.landmarks?.[0];
    if (landmarks && landmarks.length >= 33) {
      frames.push({
        t,
        landmarks: landmarks.map((point) => ({ ...point })),
        imageLandmarks: imageLandmarks?.map((point) => ({ ...point })),
      });
    }
  };

  try {
    // First pass: the whole clip, evenly, to find the swing in it.
    const coarse = Math.min(COARSE_SAMPLES_MAX, Math.max(POSE_SAMPLES, Math.ceil(span * 20)));
    // The second pass has not been sized yet; count it as a quarter-second downswing.
    const expected = coarse + 24;
    for (let index = 0; index < coarse; index += 1) {
      await readAt(start + (span * (index + 0.5)) / coarse);
      onProgress?.(index + 1, expected);
    }

    /*
      Second pass: the downswing, at up to 120 samples a second. It lasts about a quarter of
      a second and the body turns several hundred degrees a second through
      impact, so the even first pass lands tens of degrees either side of it.
      Reading every frame from just before the top to just after impact puts
      impact within a frame.
    */
    const found = findImagePhases([...frames].sort((a, b) => a.t - b.t));
    if (found) {
      const ordered = [...frames].sort((a, b) => a.t - b.t);
      const from = ordered[found.top]!.t - 0.05;
      const until = ordered[found.impact]!.t + 0.12;
      const room = MAX_POSE_SAMPLES - frames.length;
      const steps = Math.min(room, Math.ceil((until - from) * DENSE_RATE));
      for (let index = 0; index < steps; index += 1) {
        const time = from + ((until - from) * index) / Math.max(1, steps - 1);
        // Skip times the first pass already covered.
        if (!frames.some((frame) => Math.abs(frame.t - time) < 0.5 / DENSE_RATE)) await readAt(time);
        onProgress?.(coarse + index + 1, coarse + steps);
      }
    }
  } finally {
    video.currentTime = wasTime;
    if (!wasPaused) void video.play().catch(() => undefined);
  }

  return smoothFrames(frames.sort((a, b) => a.t - b.t));
}

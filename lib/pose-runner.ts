"use client";

import type { PoseFrame } from "./golf/pose";

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
  The full model rather than lite: the 3D model is only as good as the depth
  the detector infers, and full is markedly better at it for ~4 MB more.
  ponytail: heavy is better again at ~30 MB and several times slower on a
  phone; worth it only if the depth still looks soft on real clips.
*/
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

/**
 * How many frames to sample across the swing.
 *
 * The downswing takes about a quarter of a second, so impact is a narrow
 * target: at 48 samples over a three-second clip the frames are 60ms apart,
 * which lands within a few degrees of it. More samples cost detection time on
 * a phone for accuracy the single-camera depth estimate cannot support.
 */
export const POSE_SAMPLES = 48;

type Landmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number,
  ) => { worldLandmarks: { x: number; y: number; z: number; visibility?: number }[][] };
  close: () => void;
};

let cached: Promise<Landmarker> | null = null;

async function loadLandmarker(): Promise<Landmarker> {
  if (!cached) {
    cached = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return (await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      })) as unknown as Landmarker;
    })().catch((error) => {
      // A failed load must not poison every later attempt.
      cached = null;
      throw error;
    });
  }
  return cached;
}

/** Seek and wait for the frame to be there, or give up on that sample. */
function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, 2000);
    video.addEventListener("seeked", done);
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
  try {
    for (let index = 0; index < POSE_SAMPLES; index += 1) {
      const t = start + (span * (index + 0.5)) / POSE_SAMPLES;
      await seek(video, t);
      // Timestamps must increase, and they are only used for the detector's
      // own frame bookkeeping, so the sample index does the job.
      const result = landmarker.detectForVideo(video, index * 40);
      const landmarks = result.worldLandmarks?.[0];
      if (landmarks && landmarks.length >= 33) {
        frames.push({ t, landmarks: landmarks.map((point) => ({ ...point })) });
      }
      onProgress?.(index + 1, POSE_SAMPLES);
    }
  } finally {
    video.currentTime = wasTime;
    if (!wasPaused) void video.play().catch(() => undefined);
  }

  return frames;
}

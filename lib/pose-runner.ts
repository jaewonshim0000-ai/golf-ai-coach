"use client";

import { LM, type Landmark, type PoseFrame } from "./golf/pose";
import { findAutomaticTiming, swingSamplingWindow, trustworthyFrames, visiblePoint, type MotionView } from "./golf/motion-analysis";

/**
 * Running the pose detector over a swing, in the browser.
 *
 * Detection happens on the player's device, without sending video frames to
 * an inference service or requiring a model API key. The visible joints are
 * saved afterwards to the player's existing account storage.
 *
 * The model and the wasm come from the public CDNs MediaPipe
 * publishes them on, so there is no build step and no binary in the repo. They
 * are fetched once and then cached by the browser. Self-hosting is a change of
 * these two constants plus copying `node_modules/@mediapipe/tasks-vision/wasm`
 * into `public/`; worth doing if the app ever needs to work offline.
 */

const VERSION = "1.0.1";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
/*
  Use the heavy detector for visible joints. Its inferred depth does not drive
  the movement report and is omitted from new stored motion models.
*/
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";

/**
 * How many frames to sample across the swing.
 *
 * The downswing takes about a quarter of a second, so impact is a narrow
 * target. The first pass takes up to 64 samples, with room for a second pass
 * up to 128 total. Repeated source frames are discarded.
 */
export const POSE_SAMPLES = 64;
/** The first pass stops here, leaving room for the downswing pass. */
const COARSE_SAMPLES_MAX = 64;
/** What the server accepts in one model. */
const MAX_POSE_SAMPLES = 128;
/**
 * Samples a second of video time through the downswing. A 30 or 60 fps clip
 * has fewer real frames than this and the repeats are skipped; a slow-motion
 * clip has more, and this is where they pay off.
 */
const DENSE_RATE = 120;

type DetectedLandmark = Landmark & { presence?: number };

type Landmarker = {
  detect: (
    video: HTMLVideoElement,
  ) => { worldLandmarks: DetectedLandmark[][]; landmarks: DetectedLandmark[][] };
  close: () => void;
};

let cached: Promise<Landmarker> | null = null;

async function loadLandmarker(): Promise<Landmarker> {
  if (!cached) {
    cached = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      const options = {
        // Seeking and the dense second pass visit frames out of order. IMAGE
        // mode detects each independently, without an invalid tracking history.
        runningMode: "IMAGE" as const,
        numPoses: 2,
        minPoseDetectionConfidence: 0.65,
        minPosePresenceConfidence: 0.65,
      };
      try {
        return (await PoseLandmarker.createFromOptions(fileset, {
          ...options, baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
        })) as unknown as Landmarker;
      } catch {
        return (await PoseLandmarker.createFromOptions(fileset, {
          ...options, baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
        })) as unknown as Landmarker;
      }
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
    let callbackId: number | undefined;
    let fallback: number | undefined;
    const finish = (at: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearTimeout(fallback);
      if (callbackId !== undefined) video.cancelVideoFrameCallback?.(callbackId);
      video.removeEventListener("seeked", onSeeked);
      resolve(at);
    };
    const timer = window.setTimeout(() => finish(NaN), 2000);
    const onSeeked = () => {
      if (!video.requestVideoFrameCallback) return finish(video.currentTime);
      // A seek within the same source frame may not present another image.
      // Skip it rather than label the old picture with the requested time.
      fallback = window.setTimeout(() => finish(NaN), 150);
    };
    if (video.requestVideoFrameCallback) {
      // Register before seeking: registering from `seeked` can miss the frame
      // and report a requested time that belongs to a different decoded image.
      callbackId = video.requestVideoFrameCallback((_, meta) => {
        window.clearTimeout(fallback);
        finish(meta.mediaTime);
      });
    }
    video.addEventListener("seeked", onSeeked);
    if (Math.abs(video.currentTime - time) < 0.0001 && video.readyState >= 2) {
      if (!video.requestVideoFrameCallback) return finish(video.currentTime);
      // Force presentation when the playhead already matches the request.
      video.currentTime = time + 0.000001;
      return;
    }
    video.currentTime = time;
  });
}

export type PoseProgress = (done: number, total: number) => void;

/** Stay with the same visible body when a coach or spectator is in the shot. */
export function selectTrackedPose(poses: Landmark[][], previous?: Landmark[], view: MotionView = "other"): number {
  const centre = (points: Landmark[]) => {
    const left = points[LM.leftHip], right = points[LM.rightHip];
    if (visiblePoint(left) && visiblePoint(right)) return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    return view === "down_the_line" ? visiblePoint(left) ? left : visiblePoint(right) ? right : null : null;
  };
  const prior = previous ? centre(previous) : null;
  let picked = -1, best = -Infinity;
  poses.forEach((points, index) => {
    const core = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
    const body = core.map((joint) => points[joint]);
    const profileSide = [[11, 23, 27], [12, 24, 28]].find((side) => side.every((joint) => visiblePoint(points[joint])));
    if (view === "down_the_line" ? !profileSide : !body.every(visiblePoint)) return;
    const location = centre(points);
    if (!location) return;
    const height = view === "down_the_line" ? Math.abs(points[profileSide![2]!]!.y - points[profileSide![0]!]!.y) :
      Math.abs((points[LM.leftAnkle]?.y ?? location.y + 0.15) - points[LM.leftShoulder]!.y);
    const separation = prior ? Math.hypot(location.x - prior.x, location.y - prior.y) : 0;
    if (prior && separation > Math.max(0.12, height * 0.45)) return;
    const score = prior ? -separation : height - Math.abs(location.x - 0.5) * 0.2;
    if (score > best) { best = score; picked = index; }
  });
  return picked;
}

/** Spend the remaining frame budget on the swing rather than idle footage.
 * A coarse hand arc guides sampling even when it is too sparse to measure.
 * Bisect the largest gaps first, with a finer target during the downswing. */
export function refinementTimes(frames: PoseFrame[], from: number, to: number, aspect: number, view: MotionView, budget: number): number[] {
  if (budget <= 0 || to <= from) return [];
  const ordered = trustworthyFrames([...frames].sort((a, b) => a.t - b.t), aspect, view);
  const found = findAutomaticTiming(ordered, aspect, view)?.phases;
  const arc = found ? [ordered[found.address]!.t, ordered[found.top]!.t, ordered[found.impact]!.t] : swingSamplingWindow(ordered, aspect, view);
  const lower = arc ? Math.max(from, arc[0]! - 0.1) : from;
  const upper = arc ? Math.min(to, arc[2]! + 0.2) : to;
  const anchors = [...new Set([lower, ...ordered.map((frame) => frame.t).filter((time) => time > lower && time < upper), upper])].sort((a, b) => a - b);
  const planned: number[] = [];
  for (let index = 0; index < budget; index++) {
    let chosen = -1, priority = 1;
    for (let n = 1; n < anchors.length; n++) {
      const midpoint = (anchors[n - 1]! + anchors[n]!) / 2;
      const step = arc && midpoint >= arc[1]! - 0.08 && midpoint <= arc[2]! + 0.12 ? 1 / DENSE_RATE : 1 / 30;
      const gap = (anchors[n]! - anchors[n - 1]!) / step;
      if (gap > priority) { priority = gap; chosen = n; }
    }
    if (chosen < 0) break;
    const time = (anchors[chosen - 1]! + anchors[chosen]!) / 2;
    planned.push(time);
    anchors.splice(chosen, 0, time);
  }
  return planned.sort((a, b) => a - b);
}

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
  view: MotionView = "other",
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
  let previous: Landmark[] | undefined;
  /** Detect the body at one moment; false when that video frame was already read. */
  const readAt = async (time: number) => {
    const t = await seek(video, time);
    if (!Number.isFinite(t)) return;
    const key = Math.round(t * 1000);
    if (seenFrames.has(key)) return;
    seenFrames.add(key);
    const result = landmarker.detect(video);
    // Apply presence before choosing a person, not only after selection.
    const imagePoses = result.landmarks.map((pose) => pose.map((point) => ({
      ...point, visibility: Math.min(point.visibility ?? 0, point.presence ?? 1),
    })));
    const nearest = frames.reduce<PoseFrame | null>((best, frame) =>
      !best || Math.abs(frame.t - t) < Math.abs(best.t - t) ? frame : best, null);
    const selected = selectTrackedPose(imagePoses, nearest?.imageLandmarks ?? previous, view);
    if (selected < 0) return;
    const landmarks = result.worldLandmarks?.[selected];
    const imageLandmarks = imagePoses[selected];
    if (landmarks && landmarks.length >= 33) {
      previous = imageLandmarks;
      frames.push({
        t,
        landmarks: landmarks.map((point) => ({ ...point })),
        imageLandmarks: imageLandmarks?.map((point) => ({ ...point, visibility: Math.min(point.visibility ?? 0, point.presence ?? 1) })),
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

    const aspect = video.videoWidth / video.videoHeight;
    // Re-plan after a first refinement: the newly observed arc may resolve
    // timing which was unavailable in the coarse pass. Leave real frames and
    // timestamps intact, including when a requested sample decodes a repeat.
    const attempted = new Set<number>();
    let reads = 0;
    for (let pass = 0; pass < 3 && frames.length < MAX_POSE_SAMPLES; pass++) {
      const room = MAX_POSE_SAMPLES - frames.length;
      const times = refinementTimes(frames, start, start + span - 0.001, aspect, view, Math.min(room, pass === 0 ? 40 : room))
        .filter((time) => !attempted.has(Math.round(time * 1000000)));
      if (!times.length) break;
      const total = coarse + reads + times.length;
      for (const time of times) {
        if (frames.length >= MAX_POSE_SAMPLES) break;
        attempted.add(Math.round(time * 1000000));
        await readAt(time);
        reads++;
        onProgress?.(coarse + reads, total);
      }
    }
  } finally {
    video.currentTime = wasTime;
    if (!wasPaused) void video.play().catch(() => undefined);
  }

  // Keep observed x/y intact. Averaging fast-moving wrists moves contact and
  // can turn a missed/hidden joint into a convincing but invented coordinate.
  return frames.sort((a, b) => a.t - b.t);
}

"use client";

import { LM, type Landmark, type PoseFrame } from "./golf/pose";
import { findAutomaticTiming, swingSamplingWindow, trustworthyFrames, visiblePoint, type MotionView } from "./golf/motion-analysis";

import { createSwingDetector } from "./pose-worker-client";

/** Reserve half the bounded inference budget for the fast part of the swing. */
export const POSE_SAMPLES = 64;
const MAX_POSE_SAMPLES = 128;
const DENSE_RATE = 120;

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
export function seekSwingFrame(video: FrameCallbackVideo, time: number, signal?: AbortSignal): Promise<number> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    let callbackId: number | undefined;
    let fallback: number | undefined;
    const finish = (at: number, error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearTimeout(fallback);
      if (callbackId !== undefined) video.cancelVideoFrameCallback?.(callbackId);
      video.removeEventListener("seeked", onSeeked);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(at);
    };
    const abort = () => finish(NaN, new DOMException("Analysis cancelled.", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
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
 *
 * `from`, `to` and every seek are video seconds. Returned frames are labelled
 * in real swing seconds (video time / `slowMotion`), because every timing rule
 * downstream, from hand gaps to tempo, is written for a swing at real speed.
 */
export async function readSwing(
  video: HTMLVideoElement,
  from: number,
  to: number,
  onProgress?: PoseProgress,
  view: MotionView = "other",
  signal?: AbortSignal,
  slowMotion = 1,
): Promise<PoseFrame[]> {
  const span = to > from ? to - from : video.duration;
  const start = to > from ? from : 0;
  if (!Number.isFinite(span) || span <= 0) return [];

  signal?.throwIfAborted();
  const detector = createSwingDetector(signal);
  const wasTime = video.currentTime;
  const wasPaused = video.paused;
  video.pause();

  const frames: PoseFrame[] = [];
  const seenFrames = new Set<number>();
  let inferences = 0;
  let previous: Landmark[] | undefined;
  /** Detect the body at one moment; false when that video frame was already read. */
  const readAt = async (time: number) => {
    signal?.throwIfAborted();
    if (inferences >= MAX_POSE_SAMPLES) return;
    const t = await seekSwingFrame(video, time, signal);
    signal?.throwIfAborted();
    if (!Number.isFinite(t)) return;
    const key = Math.round(t * 1000);
    if (seenFrames.has(key)) return;
    seenFrames.add(key);
    inferences++;
    const result = await detector.detect(video);
    signal?.throwIfAborted();
    // Apply presence before choosing a person, not only after selection.
    const imagePoses = result.landmarks.map((pose) => pose.map((point) => ({
      ...point, visibility: Math.min(point.visibility ?? 0, point.presence ?? 1),
    })));
    const real = t / slowMotion;
    const nearest = frames.reduce<PoseFrame | null>((best, frame) =>
      !best || Math.abs(frame.t - real) < Math.abs(best.t - real) ? frame : best, null);
    const selected = selectTrackedPose(imagePoses, nearest?.imageLandmarks ?? previous, view);
    if (selected < 0) return;
    const landmarks = result.worldLandmarks?.[selected];
    const imageLandmarks = imagePoses[selected];
    if (imageLandmarks?.length === 33) {
      previous = imageLandmarks;
      frames.push({
        t: real,
        landmarks: (landmarks ?? []).map((point, joint) => ({ ...point,
          visibility: Math.min(point.visibility ?? 0, point.presence ?? 1, imageLandmarks?.[joint]?.visibility ?? 0),
        })),
        imageLandmarks: imageLandmarks?.map((point) => ({ ...point, visibility: Math.min(point.visibility ?? 0, point.presence ?? 1) })),
      });
    }
  };

  try {
    // First pass: the whole clip, evenly, to find the swing in it.
    const coarse = POSE_SAMPLES;
    // A fixed upper bound keeps progress monotonic as refinement is replanned.
    const expected = MAX_POSE_SAMPLES;
    for (let index = 0; index < coarse; index += 1) {
      await readAt(start + (span * (index + 0.5)) / coarse);
      onProgress?.(inferences, expected);
    }

    const aspect = video.videoWidth / video.videoHeight;
    // Re-plan after a first refinement: the newly observed arc may resolve
    // timing which was unavailable in the coarse pass. Leave real frames and
    // timestamps intact, including when a requested sample decodes a repeat.
    const attempted = new Set<number>();
    for (let pass = 0; pass < 3 && inferences < MAX_POSE_SAMPLES; pass++) {
      const room = MAX_POSE_SAMPLES - inferences;
      // Planned in real swing time, so the dense downswing rate means the same at any playback speed.
      const times = refinementTimes(frames, start / slowMotion, (start + span - 0.001) / slowMotion, aspect, view, Math.min(room, pass === 0 ? 40 : room))
        .filter((time) => !attempted.has(Math.round(time * 1000000)));
      if (!times.length) break;
      for (const time of times) {
        if (inferences >= MAX_POSE_SAMPLES) break;
        attempted.add(Math.round(time * 1000000));
        await readAt(time * slowMotion);
        onProgress?.(inferences, MAX_POSE_SAMPLES);
      }
    }
    onProgress?.(MAX_POSE_SAMPLES, MAX_POSE_SAMPLES);
  } finally {
    detector.close();
    video.currentTime = wasTime;
    if (!wasPaused && !signal?.aborted) void video.play().catch(() => undefined);
  }

  // Keep observed x/y intact. Averaging fast-moving wrists moves contact and
  // can turn a missed/hidden joint into a convincing but invented coordinate.
  return frames.sort((a, b) => a.t - b.t);
}

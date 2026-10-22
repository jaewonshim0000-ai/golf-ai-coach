"use client";

import { LM, type Landmark, type PoseFrame } from "./golf/pose";
import { findAutomaticTiming, swingSamplingWindow, trustworthyFrames, visiblePoint, type MotionView } from "./golf/motion-analysis";

import { createSwingDetector } from "./pose-worker-client";
import { runSwingCapture } from "./swing/capture";
import type { CaptureStage } from "./swing/policy";

/** Reserve half the bounded inference budget for the fast part of the swing. */
export const POSE_SAMPLES = 48;
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
  const heightOf = (points: Landmark[]) => {
    const side = [[11, 27], [12, 28]].find(([s, a]) => visiblePoint(points[s!]) && visiblePoint(points[a!]));
    return side ? Math.abs(points[side[1]!]!.y - points[side[0]!]!.y) : null;
  };
  const priorHeight = previous ? heightOf(previous) : null;
  let picked = -1, best = -Infinity, second = -Infinity, selectedHeight = 0;
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
    const ratio = priorHeight && height > 0 ? height / priorHeight : 1;
    if (ratio < 0.65 || ratio > 1.35) return;
    const score = prior ? -separation - Math.abs(Math.log(ratio)) * 0.15 : height - Math.abs(location.x - 0.5) * 1.5;
    if (score > best) { second = best; best = score; picked = index; selectedHeight = height; }
    else second = Math.max(second, score);
  });
  // Similar candidates do not establish identity; abstain instead of jumping
  // to a spectator when the detector reorders or bodies cross in the image.
  if (best - second < Math.max(0.012, selectedHeight * 0.04)) return -1;
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
  signal?: AbortSignal,
): Promise<PoseFrame[]> {
  return (await captureSwing(video, from, to, onProgress, view, signal)).frames;
}

const activeCaptures = new WeakMap<HTMLVideoElement, AbortController>();

/** Browser adapter. A newer run owns the playhead and cancels its predecessor. */
export async function captureSwing(
  video: HTMLVideoElement, from: number, to: number,
  onProgress?: (done: number, total: number, stage: CaptureStage) => void,
  view: MotionView = "other", signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  activeCaptures.get(video)?.abort();
  const run = new AbortController();
  activeCaptures.set(video, run);
  const cancel = () => run.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  const wasTime = video.currentTime, wasPaused = video.paused;
  video.pause();
  try {
    return await runSwingCapture({
      width: video.videoWidth, height: video.videoHeight, duration: video.duration,
      decodedTimestamps: typeof video.requestVideoFrameCallback === "function",
      seek: (time, abort) => seekSwingFrame(video, time, abort),
      detector: (variant, abort) => {
        const detector = createSwingDetector(abort, variant);
        return { detect: () => detector.detect(video), close: () => detector.close() };
      },
    }, { select: selectTrackedPose, refine: refinementTimes }, {
      from, to, view, signal: run.signal, progress: onProgress,
    });
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (activeCaptures.get(video) === run) {
      activeCaptures.delete(video);
      video.currentTime = wasTime;
      if (!wasPaused && !signal?.aborted) void video.play().catch(() => undefined);
    }
  }
}

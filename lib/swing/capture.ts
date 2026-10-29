import type { PoseDetection } from "../pose-detector";
import type { Landmark, PoseFrame } from "../golf/pose";
import { estimateSlowMotion, swingSamplingWindow, trustworthyFrames, type MotionView } from "../golf/motion-analysis";
import { detectView } from "../golf/framing";
import { CAPTURE_LIMITS, SWING_ENGINE, type CaptureStage, type PoseVariant } from "./policy";
import type { CaptureManifest } from "./contracts";
import { swingCandidates } from "./segments";

export type CaptureDetector = { detect(): Promise<PoseDetection>; close(): void };
export type CaptureSource = {
  width: number; height: number; duration: number; decodedTimestamps: boolean;
  seek(time: number, signal: AbortSignal): Promise<number>;
  detector(variant: PoseVariant, signal: AbortSignal): CaptureDetector;
};
export type CaptureAlgorithms = {
  select(poses: Landmark[][], previous: Landmark[] | undefined, view: MotionView): number;
  refine(frames: PoseFrame[], from: number, to: number, aspect: number, view: MotionView, budget: number): number[];
};

function aborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason ?? new DOMException("Analysis cancelled.", "AbortError"));
    signal.addEventListener("abort", stop, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}

/**
 * Sequential, bounded, and injectable. Scout coordinates never enter measured tracks.
 * Times in and out of the source are video seconds. Without a `view`, a few
 * early frames decide it. The playback slowdown is read from the measured
 * swing afterwards, and returned frames are labelled in real swing seconds.
 */
export async function runSwingCapture(source: CaptureSource, algorithms: CaptureAlgorithms, options: {
  from: number; to: number; view?: MotionView; signal?: AbortSignal;
  progress?: (done: number, total: number, stage: CaptureStage) => void;
}): Promise<{ frames: PoseFrame[]; capture: CaptureManifest; view: MotionView; slowMotion: number }> {
  const { from, to } = options;
  let view = options.view;
  if (![source.width, source.height, source.duration, from, to].every(Number.isFinite) || source.width <= 0 || source.height <= 0 ||
      from < 0 || to <= from || to > source.duration + 0.01) throw new Error("The video range could not be read. Reload this recording.");
  if (to - from > CAPTURE_LIMITS.maxClipSeconds) throw new Error(`This video is longer than ${CAPTURE_LIMITS.maxClipSeconds} seconds. Record one swing and try again.`);
  const run = new AbortController();
  const cancel = () => run.abort(options.signal?.reason);
  options.signal?.throwIfAborted();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => run.abort(new Error("Tracking took too long on this device. Record a shorter clip and try again.")), CAPTURE_LIMITS.deadlineMs);
  const began = performance.now(), aspect = source.width / source.height;
  let detector: CaptureDetector | undefined;
  let inferences = 0, seeks = 0, duplicates = 0, rejectedPoses = 0;
  const report = (stage: CaptureStage) => options.progress?.(inferences, CAPTURE_LIMITS.inferences, stage);
  const scan = async (times: number[], frames: PoseFrame[], seen: Set<number>, stage: CaptureStage, phaseLimit: number = CAPTURE_LIMITS.inferences) => {
    for (const time of times) {
      run.signal.throwIfAborted();
      if (inferences >= Math.min(CAPTURE_LIMITS.inferences, phaseLimit) || seeks >= CAPTURE_LIMITS.seeks) break;
      seeks++;
      const t = await aborted(source.seek(time, run.signal), run.signal);
      if (!Number.isFinite(t) || t < 0 || t < from - 0.05 || t > to + 0.01) continue;
      const key = Math.round(t * 1000000);
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      inferences++; // failed or empty detections also consume the budget
      const poses = await detect();
      const nearest = frames.reduce<PoseFrame | undefined>((best, frame) => !best || Math.abs(frame.t - t) < Math.abs(best.t - t) ? frame : best, undefined);
      const chosen = algorithms.select(poses, nearest?.imageLandmarks, view ?? "other");
      if (chosen < 0 || poses[chosen]?.length !== 33) rejectedPoses++;
      else frames.push({ t, landmarks: [], imageLandmarks: poses[chosen] });
      report(stage);
    }
  };
  const detect = async () => (await aborted(detector!.detect(), run.signal)).landmarks.map((pose) => pose.map((p) => ({ ...p, z: 0,
    visibility: Math.min(p.visibility ?? 0, p.presence ?? 1) })));
  const evenly = (lo: number, hi: number, count: number) => Array.from({ length: count }, (_, n) => lo + (hi - lo) * (n + 0.5) / count);
  try {
    let lower = from, upper = to;
    const scout = to - from > 4;
    if (!view) {
      // The golfer is usually at address early in the clip; the top of the
      // backswing can look like the other view, so three frames vote.
      detector = source.detector(scout ? "lite" : "heavy", run.signal);
      const votes = { face_on: 0, down_the_line: 0 };
      for (const time of evenly(from, from + (to - from) * 0.3, 3)) {
        run.signal.throwIfAborted();
        seeks++;
        if (!Number.isFinite(await aborted(source.seek(time, run.signal), run.signal))) continue;
        inferences++;
        const seen = detectView(await detect(), aspect);
        if (seen) votes[seen]++;
        report(scout ? "scouting" : "measuring");
      }
      view = votes.down_the_line > votes.face_on ? "down_the_line" : "face_on";
    }
    if (scout) {
      detector ??= source.detector("lite", run.signal);
      const scouts: PoseFrame[] = [];
      await scan(evenly(from, to, CAPTURE_LIMITS.scout), scouts, new Set(), "scouting", inferences + CAPTURE_LIMITS.scout);
      detector.close(); detector = undefined;
      scouts.sort((a, b) => a.t - b.t);
      // ponytail: practice swings come before the shot, so the last complete swing is reviewed. A wrong pick needs a re-record.
      const arc = swingCandidates(scouts, aspect, view).at(-1) ?? swingSamplingWindow(scouts, aspect, view);
      // Margins scale with the swing so a slowed clip keeps its setup and finish.
      if (arc) { const span = arc[2] - arc[0]; lower = Math.max(from, arc[0] - Math.max(0.2, span * 0.25)); upper = Math.min(to, arc[2] + Math.max(0.3, span * 0.4)); }
      // Without a supported hint, spend the measurement budget uniformly.
      // The evidence gate will abstain if a full swing remains undersampled.
    }
    const measurementStart = inferences;
    run.signal.throwIfAborted();
    detector ??= source.detector("heavy", run.signal);
    const frames: PoseFrame[] = [], seen = new Set<number>();
    const measurementLimit = measurementStart + CAPTURE_LIMITS.measurements;
    await scan(evenly(lower, upper, 48), frames, seen, "measuring", measurementLimit);
    const attempted = new Set<number>();
    for (let pass = 0; pass < 3; pass++) {
      const remaining = Math.min(CAPTURE_LIMITS.measurements - (inferences - measurementStart), CAPTURE_LIMITS.inferences - inferences);
      if (remaining <= 0) break;
      const times = algorithms.refine(frames, lower, upper - 0.001, aspect, view, Math.min(remaining, pass === 0 ? 32 : remaining))
        .filter((t) => !attempted.has(Math.round(t * 1000000)));
      if (!times.length) break;
      times.forEach((t) => attempted.add(Math.round(t * 1000000)));
      await scan(times, frames, seen, "refining", measurementLimit);
    }
    run.signal.throwIfAborted();
    const elapsedMs = Math.round(performance.now() - began);
    if (elapsedMs > CAPTURE_LIMITS.deadlineMs)
      throw new Error("Tracking took too long on this device. Record a shorter clip and try again.");
    frames.sort((a, b) => a.t - b.t);
    const slowMotion = estimateSlowMotion(trustworthyFrames(frames, aspect, view), aspect, view);
    return { view, slowMotion, frames: frames.map((frame) => ({ ...frame, t: frame.t / slowMotion })), capture: {
      engine: SWING_ENGINE, measurementModel: "mediapipe-heavy-f16-v1", scoutModel: scout ? "mediapipe-lite-f16-v1" : "none",
      timestampSource: source.decodedTimestamps ? "decoded" : "seek", width: source.width, height: source.height,
      maxInputEdge: CAPTURE_LIMITS.maxEdge, inferences, seeks, duplicates, rejectedPoses,
      elapsedMs,
    } };
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
    detector?.close();
    // Settle any lingering adapter work before it can mutate a completed run.
    run.abort();
  }
}

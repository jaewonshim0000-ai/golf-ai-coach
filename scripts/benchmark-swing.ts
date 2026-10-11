import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { ASPECT, DOWN_THE_LINE, FACE_ON, film } from "../lib/golf/swing.fixture";
import type { Landmark, PoseFrame } from "../lib/golf/pose";
import type { MotionView } from "../lib/golf/motion-analysis";
import { reconstructSwing } from "../lib/golf/reconstruction";

type Capture = { name: string; aspect: number; view: MotionView; detected: PoseFrame[]; truth: PoseFrame[] };
// Real reference files must use identical timestamps, joint order and camera
// axes. Root alignment removes translation ONLY, not rotation/scale error.
const file = process.argv[2];
const captures: Capture[] = file ? JSON.parse(readFileSync(file, "utf8")) :
  (["face_on", "down_the_line"] as const).flatMap((view) => [1, 8, 17, 32, 64].map((seed) => ({
    name: `${view}-${seed}`, view, aspect: ASPECT,
    ...film(view === "face_on" ? FACE_ON : DOWN_THE_LINE, seed),
  })));
const joints = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const root = (frame: PoseFrame): Landmark => ({ x: (frame.landmarks[23]!.x + frame.landmarks[24]!.x) / 2,
  y: (frame.landmarks[23]!.y + frame.landmarks[24]!.y) / 2, z: (frame.landmarks[23]!.z + frame.landmarks[24]!.z) / 2 });
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const round = (value: number | null) => value === null ? null : Math.round(value * 100) / 100;
const result = captures.map((capture) => {
  if (!capture.detected.length || capture.truth.length !== capture.detected.length || capture.truth.some((frame, index) =>
    frame.t !== capture.detected[index]!.t || frame.landmarks.length !== 33 || !frame.landmarks.every(point =>
      [point.x, point.y, point.z].every(Number.isFinite)))) throw new Error(`${capture.name}: reference must contain 33 joints at each detected timestamp.`);
  const start = performance.now();
  const rebuilt = reconstructSwing(capture.detected, capture.aspect, capture.view);
  const elapsed = performance.now() - start;
  if (!rebuilt) return { name: capture.name, reconstructed: false };
  // Use exactly the same visible reference joints for both errors, so hiding
  // difficult joints in reconstruction cannot improve this metric artificially.
  const errors = (frames: PoseFrame[]) => frames.flatMap((frame, index) => {
    const reference = capture.truth[index]!, origin = root(frame), target = root(reference);
    return joints.flatMap((joint) => {
      if ((reference.landmarks[joint]!.visibility ?? 0) < 0.6 || (capture.detected[index]!.imageLandmarks?.[joint]?.visibility ?? 0) < 0.6) return [];
      const a = frame.landmarks[joint]!, b = reference.landmarks[joint]!;
      return [1000 * Math.hypot(a.x - origin.x - b.x + target.x, a.y - origin.y - b.y + target.y, a.z - origin.z - b.z + target.z)];
    });
  });
  const corrected = errors(rebuilt);
  return { name: capture.name, reconstructed: true, frames: rebuilt.length,
    reconstructionMs: round(elapsed), detectorRootRelativeErrorMm: round(mean(errors(capture.detected))),
    reconstructedRootRelativeErrorMm: round(mean(corrected)),
    supported3dJointPercent: round(100 * mean(rebuilt.flatMap(frame => joints.map(joint => (frame.landmarks[joint]!.visibility ?? 0) >= 0.6 ? 1 : 0)))!),
  };
});
console.log(JSON.stringify({ dataset: file ?? "Synthetic regression fixtures; not real-world accuracy validation",
  measurement: "Mean root-relative joint error in camera axes; no scale/rotation alignment. Timing excludes video decode and model inference.", captures: result }, null, 2));

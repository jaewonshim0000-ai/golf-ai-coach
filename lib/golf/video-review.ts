import { analyseMotion, type MotionView } from "./motion-analysis";
import { packFrames, unpackFrames, type PoseFrame, type PoseModel, type SwingPhases } from "./pose";

export function analyseVideoModel(model: PoseModel) {
  return analyseMotion(unpackFrames(model), model.aspect ?? 0, model.cameraAngle ?? "other", model.handedness,
    model.phasesConfirmed ? model.phases : undefined);
}

/** Save the observed 2D tracks even when timing or displacement is unclear.
 * A quality limitation belongs to its reading, not to the entire recording. */
export function buildVideoModel(frames: PoseFrame[], options: {
  aspect: number; view: MotionView; handedness: "right" | "left"; clip?: [number, number]; phases?: SwingPhases;
}): PoseModel {
  const report = analyseMotion(frames, options.aspect, options.view, options.handedness, options.phases);
  return {
    v: 1, handedness: options.handedness, ...packFrames(frames), frames: [],
    // Legacy consumers require indices. Unresolved placeholders are never
    // presented as observations; analyseVideoModel recomputes automatic timing.
    phases: report.phases ?? { address: 0, top: Math.floor(frames.length / 2), impact: frames.length - 1 },
    aspect: options.aspect, cameraAngle: options.view, motionVersion: 1, clip: options.clip,
    phasesConfirmed: Boolean(options.phases),
    timingStatus: options.phases ? "confirmed" : report.phases ? "estimated" : "unresolved",
  };
}

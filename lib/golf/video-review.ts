import { analyseMotion, trustworthyFrames, type MotionView } from "./motion-analysis";
import { packFrames, unpackFrames, type PoseFrame, type PoseModel, type SwingPhases } from "./pose";
import type { CaptureManifest } from "../swing/contracts";
import { frameTime } from "../golfposepro/result";

export function analyseVideoModel(model: PoseModel) {
  const frames = unpackFrames(model), aspect = model.aspect ?? 0, view = model.cameraAngle ?? "other";
  const report = analyseMotion(frames, aspect, view, model.handedness, model.phasesConfirmed ? model.phases : undefined);
  const gpp = model.golfPosePro;
  if (report.phases || !gpp) return report;
  // Automatic timing failed, but GolfPosePro read every frame and found the swing: time it from its key frames.
  const trusted = trustworthyFrames(frames, aspect, view);
  const at = (phase: string) => {
    const key = gpp.keyFrames.find((frame) => frame.phase === phase);
    if (!key) return -1;
    const time = frameTime(gpp, key.frame);
    return trusted.reduce((best, frame, i) => Math.abs(frame.t - time) < Math.abs(trusted[best]!.t - time) ? i : best, 0);
  };
  const fallback = analyseMotion(frames, aspect, view, model.handedness, { address: at("Address"), top: at("Top"), impact: at("Impact") });
  if (!fallback.usable) return report;
  // GolfPosePro's phases are too coarse to time rhythm, so only body positions are read from them.
  fallback.tempo = null;
  fallback.observations = fallback.observations.filter((item) => item.title !== "Swing rhythm");
  return fallback;
}

/** Save the observed 2D tracks even when timing or displacement is unclear.
 * A quality limitation belongs to its reading, not to the entire recording. */
export function buildVideoModel(frames: PoseFrame[], options: {
  aspect: number; view: MotionView; handedness: "right" | "left"; clip?: [number, number]; phases?: SwingPhases; capture?: CaptureManifest;
  ballSide?: "left" | "right"; slowMotion?: number;
}): PoseModel {
  const report = analyseMotion(frames, options.aspect, options.view, options.handedness, options.phases);
  return {
    v: 1, handedness: options.handedness, ...packFrames(frames), frames: [],
    // Legacy consumers require indices. Unresolved placeholders are never
    // presented as observations; analyseVideoModel recomputes automatic timing.
    phases: report.phases ?? { address: 0, top: Math.floor(frames.length / 2), impact: frames.length - 1 },
    aspect: options.aspect, cameraAngle: options.view, motionVersion: 1, clip: options.clip,
    capture: options.capture,
    ballSide: options.ballSide,
    ...(options.slowMotion && options.slowMotion > 1 ? { slowMotion: options.slowMotion } : {}),
    phasesConfirmed: Boolean(options.phases),
    timingStatus: options.phases ? "confirmed" : report.phases ? "estimated" : "unresolved",
  };
}

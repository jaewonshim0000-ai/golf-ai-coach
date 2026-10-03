import type { PoseModel, PackedLandmark } from "../pose";

export function denseMotionModel(): PoseModel {
  return {
    v: 1, motionVersion: 1, handedness: "right", aspect: 9 / 16, cameraAngle: "face_on",
    phases: { address: 10, top: 65, impact: 110 }, timingStatus: "estimated",
    t: Array.from({ length: 128 }, (_, index) => index / 120),
    frames: [],
    imageFrames: Array.from({ length: 128 }, (_, frame) => Array.from({ length: 33 }, (_, joint): PackedLandmark => [
      Math.round((Math.sin(frame * 7 + joint * 3) + 1) * 50000) / 100000,
      Math.round((Math.cos(frame * 3 + joint * 7) + 1) * 50000) / 100000,
      -0.215, Math.round((Math.sin(frame + joint) + 1) * 500) / 1000,
    ])),
  };
}

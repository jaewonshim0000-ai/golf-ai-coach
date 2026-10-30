import type { PoseFrame } from "../golf/pose";
import { GPP_PHASES, detectSwingPhases, wristY, type GppLandmark, type GppPhase, type GppPhaseRanges } from "./phases";

/** Bump when capture or segmentation changes, so saved swings are read again. */
export const GPP_VERSION = 1;
/** ponytail: a minute at 30 fps, about five minutes of reading; longer clips need a trim. */
export const MAX_FRAMES = 1800;

/** Everything GolfPosePro produces for one clip, as stored with the swing. */
export type GolfPoseProResult = {
  version: number;
  fps: number;
  width: number;
  height: number;
  /** Video frame of index 0; non-zero only for a trimmed clip. */
  startFrame: number;
  /** extract_pose_features_debug: wrist height per frame in pixels from the top, null where unseen. */
  wristY: (number | null)[];
  /** detect_swing_phases, in frame indices from startFrame. */
  phases: GppPhaseRanges;
  swingStart: number;
  swingEnd: number;
  /** compare_swing_phases: the middle frame of each phase and the pose on it, [x, y, visibility] x 33. */
  keyFrames: { phase: GppPhase; frame: number; pose: [number, number, number][] | null }[];
};

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Seconds into the video for a frame index of this result. */
export const frameTime = (result: Pick<GolfPoseProResult, "fps" | "startFrame">, frame: number) => (result.startFrame + frame) / result.fps;

/**
 * GolfPosePro's analysis of every frame's pose, plus up to 96 frames of the
 * swing in the app's track format so the video overlay and reference
 * comparison keep working. Null when the notebook would find no swing.
 */
export function golfPoseProResult(poses: (GppLandmark[] | null)[], fps: number, width: number, height: number, startFrame = 0): { result: GolfPoseProResult; track: PoseFrame[] } | null {
  // Stored to 0.01 px; segment the stored values so the server's recomputation matches.
  const wrist = poses.map((pose) => { const value = wristY(pose, height); return value === null ? null : round(value, 2); });
  const segmentation = detectSwingPhases(wrist);
  if (!segmentation || !(fps > 0)) return null;
  const { phases, swingStart, swingEnd } = segmentation;
  const keyFrames = GPP_PHASES.map((phase) => {
    // s_middle = int((s_start + s_end) // 2)
    const frame = Math.floor((phases[phase][0] + phases[phase][1]) / 2);
    const pose = poses[frame];
    return { phase, frame, pose: pose ? pose.map((p): [number, number, number] => [round(p.x, 4), round(p.y, 4), round(p.visibility ?? 0, 3)]) : null };
  });
  const result: GolfPoseProResult = {
    version: GPP_VERSION, fps: round(fps, 3), width, height, startFrame,
    wristY: wrist,
    phases, swingStart, swingEnd, keyFrames,
  };
  // Frames around the swing, evenly thinned, for the stored overlay track.
  const margin = Math.round(fps / 2);
  let around = poses.flatMap((pose, frame) => pose && frame >= swingStart - margin && frame <= swingEnd + margin ? [frame] : []);
  if (around.length < 8) around = poses.flatMap((pose, frame) => pose ? [frame] : []);
  if (around.length < 8) return { result, track: [] };
  const step = Math.max(1, around.length / 96);
  const chosen = [...new Set(Array.from({ length: Math.min(96, around.length) }, (_, n) => around[Math.floor(n * step)]!))];
  const track = chosen.map((frame) => ({
    t: frameTime(result, frame), landmarks: [],
    imageLandmarks: poses[frame]!.map((p) => ({ x: p.x, y: p.y, z: 0, visibility: p.visibility ?? 0 })),
  }));
  return { result, track };
}

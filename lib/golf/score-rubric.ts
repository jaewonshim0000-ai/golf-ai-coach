// Thresholds and weights of the 100-point swing score. `npm run calibrate:swing -- --write`
// rewrites this file from the coach-scored clips in calibration/swings.

/** Each check scores 100 through `free`, falling linearly to 0 at `severe` (in the
 * check's own unit; for tempo, ratio points outside 2:1 to 4:1). Weights are relative.
 * A check the video cannot measure counts in the total at its `missing` score. */
export type CheckRubric = { weight: number; free: number; severe: number; missing: number };
export type ScoreCheckId = "head" | "height" | "posture" | "hip_depth" | "tempo";
export type ScoreRubric = Record<ScoreCheckId, CheckRubric>;

export const SCORE_RUBRIC: ScoreRubric = {
  "head": { "weight": 16, "free": 24, "severe": 40, "missing": 70 },
  "height": { "weight": 16, "free": 5, "severe": 15, "missing": 70 },
  "posture": { "weight": 45, "free": 1.8, "severe": 3.8, "missing": 70 },
  "hip_depth": { "weight": 25, "free": 0.6, "severe": 4.8, "missing": 75 },
  "tempo": { "weight": 12, "free": 0.3, "severe": 2.4, "missing": 60 }
};

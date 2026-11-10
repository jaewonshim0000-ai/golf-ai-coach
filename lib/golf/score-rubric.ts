// Thresholds and weights of the 100-point swing score. `npm run calibrate:swing -- --write`
// rewrites this file from the coach-scored clips in calibration/swings.

/** Each check scores 100 through `free`, falling linearly to 0 at `severe` (in the
 * check's own unit; for tempo, ratio points outside 2:1 to 4:1). Weights are relative. */
export type CheckRubric = { weight: number; free: number; severe: number };
export type ScoreCheckId = "head" | "height" | "posture" | "hip_depth" | "tempo";
export type ScoreRubric = Record<ScoreCheckId, CheckRubric>;

export const SCORE_RUBRIC: ScoreRubric = {
  "head": { "weight": 40, "free": 12, "severe": 40 },
  "height": { "weight": 30, "free": 4, "severe": 15 },
  "posture": { "weight": 35, "free": 10, "severe": 30 },
  "hip_depth": { "weight": 35, "free": 3, "severe": 12 },
  "tempo": { "weight": 30, "free": 0, "severe": 2 }
};

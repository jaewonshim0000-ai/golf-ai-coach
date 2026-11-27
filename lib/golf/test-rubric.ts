import { SCORE_RUBRIC } from "./score-rubric";

// Scoring-mechanics tests import this first so `npm run calibrate:swing -- --write`
// can retune the live rubric without rewriting their expected numbers.
Object.assign(SCORE_RUBRIC, {
  head: { weight: 40, free: 12, severe: 40, missing: 70 },
  height: { weight: 30, free: 4, severe: 15, missing: 70 },
  posture: { weight: 35, free: 10, severe: 30, missing: 70 },
  hip_depth: { weight: 35, free: 3, severe: 12, missing: 70 },
  tempo: { weight: 30, free: 0, severe: 2, missing: 70 },
});

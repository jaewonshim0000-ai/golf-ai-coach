import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { MotionReport } from "../golf/motion-analysis";
import type { PoseModel } from "../golf/pose";
import { scoreSwing } from "../golf/swing-score";
import { SCORE_RUBRIC, type CheckRubric, type ScoreCheckId, type ScoreRubric } from "../golf/score-rubric";
import { reviewSwing } from "./review";

/** Coach-scored clips, one JSON file each, written by the local /swing/calibrate page. */
export const CALIBRATION_DIR = path.join("calibration", "swings");

export const calibrationLabelSchema = z.object({
  name: z.string().trim().min(1).max(160),
  /** Out of 10 with at most one decimal, as the player sees scores. */
  score: z.number().min(0).max(10).refine((score) => Math.abs(score * 10 - Math.round(score * 10)) < 1e-9, "Use at most one decimal."),
  note: z.string().trim().max(1000).optional(),
});
const fileSchema = calibrationLabelSchema.extend({
  savedAt: z.string(),
  model: z.custom<PoseModel>((value) => typeof value === "object" && value !== null),
});
export type CalibrationSwing = z.infer<typeof fileSchema> & { file: string };

/** One file per clip name, so scoring a clip again replaces it. */
export const calibrationFile = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "clip"}.json`;

export function saveCalibrationSwing(swing: Omit<CalibrationSwing, "file">, dir = CALIBRATION_DIR): string {
  mkdirSync(dir, { recursive: true });
  const file = calibrationFile(swing.name);
  writeFileSync(path.join(dir, file), JSON.stringify(swing));
  return file;
}

/** Every readable clip in file-name order; unreadable files are named in `skipped`. */
export function loadCalibrationSwings(dir = CALIBRATION_DIR): { swings: CalibrationSwing[]; skipped: string[] } {
  let files: string[] = [];
  try { files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort(); } catch { /* No clips yet. */ }
  const swings: CalibrationSwing[] = [], skipped: string[] = [];
  for (const file of files) {
    try { swings.push({ ...fileSchema.parse(JSON.parse(readFileSync(path.join(dir, file), "utf8"))), file }); }
    catch { skipped.push(file); }
  }
  return { swings, skipped };
}

export function deleteCalibrationSwing(file: string, dir = CALIBRATION_DIR) {
  if (!/^[a-z0-9-]+\.json$/.test(file)) throw new Error("Not a calibration file.");
  rmSync(path.join(dir, file), { force: true });
}

/** A clip read once by the current analysis, ready to score under any rubric. */
export type CalibrationSample = {
  file: string; name: string; note?: string;
  /** The coach's score in the app's internal points of 100 (9.8 is 98). */
  coach: number;
  /** Null when the swing page would block the review. */
  report: MotionReport | null; ballSide?: "left" | "right";
  /** Why the app gives no score, as the swing page says it. */
  reason: string | null;
};

export function calibrationSamples(swings: CalibrationSwing[]): CalibrationSample[] {
  return swings.map(({ file, name, score, note, model }) => {
    const { report, blocks } = reviewSwing(model);
    return { file, name, coach: Math.round(score * 10), note, report: blocks.length ? null : report, ballSide: model.ballSide,
      reason: blocks[0] ?? scoreSwing(report, model.ballSide).reason };
  });
}

/** The swing page's score for this clip under `rubric`. */
export const appScore = (sample: CalibrationSample, rubric: ScoreRubric = SCORE_RUBRIC) =>
  sample.report ? scoreSwing(sample.report, sample.ballSide, rubric).total : null;

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Mean |app − coach| in points of 100 (tenths of the 10-point score) over the clips the app can score; null when it can score none. */
export function meanError(samples: CalibrationSample[], rubric: ScoreRubric = SCORE_RUBRIC): number | null {
  const errors = samples.flatMap((sample) => {
    const app = appScore(sample, rubric);
    return app === null ? [] : [Math.abs(app - sample.coach)];
  });
  return errors.length ? mean(errors) : null;
}

const valid = ({ weight, free, severe }: CheckRubric) => weight >= 1 && weight <= 100 && free >= 0 && severe > free;

/**
 * Each check's weight and thresholds, nudged one at a time while the mean error
 * falls. ponytail: greedy coordinate descent finds a local minimum; a few dozen
 * clips can overfit it, so judge a fit by crossValidate, not by its own error.
 */
export function fitRubric(samples: CalibrationSample[], start: ScoreRubric = SCORE_RUBRIC): ScoreRubric {
  let best = start, bestError = meanError(samples, best) ?? Infinity;
  for (let round = 0; round < 40; round++) {
    let improved = false;
    for (const id of Object.keys(best) as ScoreCheckId[]) for (const key of ["weight", "free", "severe"] as const) {
      const value = best[id][key], step = key === "weight" ? 5 : best[id].severe / 10;
      for (const next of [value * 0.5, value * 0.8, value * 1.25, value * 2, value - 2 * step, value - step, value + step, value + 2 * step]) {
        const candidate = { ...best, [id]: { ...best[id], [key]: key === "weight" ? Math.round(next) : Math.round(next * 10) / 10 } };
        if (!valid(candidate[id])) continue;
        const error = meanError(samples, candidate) ?? Infinity;
        if (error < bestError - 1e-9) { best = candidate; bestError = error; improved = true; }
      }
    }
    if (!improved) break;
  }
  return best;
}

/** Expected error of a fitted rubric on clips it has not seen: k-fold, null under 2k scorable clips. */
export function crossValidate(samples: CalibrationSample[], folds = 5): number | null {
  const scored = samples.filter((sample) => appScore(sample) !== null);
  if (scored.length < folds * 2) return null;
  return mean(Array.from({ length: folds }, (_, fold) => {
    const fitted = fitRubric(scored.filter((_, index) => index % folds !== fold));
    return scored.filter((_, index) => index % folds === fold).map((sample) => Math.abs(appScore(sample, fitted)! - sample.coach));
  }).flat());
}

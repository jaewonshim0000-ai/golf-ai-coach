import { readFileSync, writeFileSync } from "node:fs";
import { SCORE_RUBRIC, type ScoreCheckId, type ScoreRubric } from "../lib/golf/score-rubric";
import { CALIBRATION_DIR, appScore, calibrationSamples, crossValidate, fitRubric, loadCalibrationSwings, meanError } from "../lib/swing/calibration";

// npm run calibrate:swing -- [folder] [--write]
// Compares the app's 100-point score with coach scores from /swing/calibrate, fits the
// rubric to them, and with --write adopts the fit when it beats the current rubric on held-out clips.
const dir = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? CALIBRATION_DIR;
const { swings, skipped } = loadCalibrationSwings(dir);
if (skipped.length) console.log(`Skipped unreadable files: ${skipped.join(", ")}`);
if (!swings.length) {
  console.log(`No coach-scored clips in ${dir}. Add some at /swing/calibrate while running npm run dev.`);
  process.exit(0);
}
const samples = calibrationSamples(swings);
const fitted = fitRubric(samples);
const [now, after, heldOut] = [meanError(samples), meanError(samples, fitted), crossValidate(samples)];
const points = (value: number | null) => value === null ? "n/a" : `${value.toFixed(1)} points`;
const scored = samples.filter((sample) => appScore(sample) !== null);

console.log(`\n${swings.length} clips, ${scored.length} scored by the app. Largest disagreements first (coach / app now / app fitted):\n`);
for (const sample of [...scored].sort((a, b) => Math.abs(appScore(b)! - b.coach) - Math.abs(appScore(a)! - a.coach)))
  console.log(`${String(sample.coach).padStart(3)} / ${String(appScore(sample)).padStart(3)} / ${String(appScore(sample, fitted)).padStart(3)}  ${sample.name}${sample.note ? ` - ${sample.note}` : ""}`);
for (const sample of samples.filter((item) => appScore(item) === null))
  console.log(`${String(sample.coach).padStart(3)} / no score  ${sample.name}: ${sample.reason}${sample.note ? ` - ${sample.note}` : ""}`);

console.log(`\nAverage difference: now ${points(now)}, fitted ${points(after)} on these clips, ${points(heldOut)} on held-out clips (5-fold).`);
for (const id of Object.keys(fitted) as ScoreCheckId[]) {
  const [a, b] = [SCORE_RUBRIC[id], fitted[id]];
  if (JSON.stringify(a) !== JSON.stringify(b))
    console.log(`  ${id}: weight ${a.weight} → ${b.weight}, full marks through ${a.free} → ${b.free}, zero at ${a.severe} → ${b.severe}`);
}

if (process.argv.includes("--write")) {
  if (heldOut === null || now === null || heldOut >= now) {
    console.log("\nNot written: the fit must beat the current rubric on held-out clips (needs 10+ scored clips).");
    process.exitCode = 2;
  } else {
    const file = new URL("../lib/golf/score-rubric.ts", import.meta.url);
    const body = (Object.entries(fitted) as [ScoreCheckId, ScoreRubric[ScoreCheckId]][])
      .map(([id, { weight, free, severe }]) => `  "${id}": { "weight": ${weight}, "free": ${free}, "severe": ${severe} }`).join(",\n");
    writeFileSync(file, readFileSync(file, "utf8").replace(/export const SCORE_RUBRIC: ScoreRubric = \{[\s\S]*?\n\};/,
      `export const SCORE_RUBRIC: ScoreRubric = {\n${body}\n};`));
    console.log("\nWrote lib/golf/score-rubric.ts. Run npm test, then review the diff.");
  }
}

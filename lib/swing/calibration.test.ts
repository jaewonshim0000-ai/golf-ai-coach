import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { MotionReading, MotionReport } from "../golf/motion-analysis";
import type { PoseModel } from "../golf/pose";
import { SCORE_RUBRIC } from "../golf/score-rubric";
import { appScore, calibrationFile, crossValidate, deleteCalibrationSwing, fitRubric, loadCalibrationSwings, meanError,
  saveCalibrationSwing, type CalibrationSample } from "./calibration";

function faceOn(head: number, lift: number, ratio: number): MotionReport {
  const row = (id: string, value: number, unit: MotionReading["unit"], phase: MotionReading["phase"], time: number): MotionReading =>
    ({ id, value, unit, label: id, note: "Observed", phase, time });
  return { view: "face_on", usable: true, phases: { address: 0, top: 20, impact: 30 }, timing: { source: "hands", uncertainty: 0.02 },
    quality: { visible: 32, total: 32, coverage: 1, cameraStable: true, largestGap: 0.04 }, warnings: [], observations: [], summary: "Tracked",
    tempo: { backswing: 0.9, downswing: 0.9 / ratio, ratio, uncertainty: 0.02 },
    readings: [row("head_impact", head, "% stance", "impact", 1.1), row("lift_top", lift, "% body height", "top", 0.8)] };
}

describe("score calibration", () => {
  it("fits the rubric toward a coach who is stricter about head movement than the app", () => {
    const coach = { ...SCORE_RUBRIC, head: { weight: 60, free: 5, severe: 25 } };
    const samples: CalibrationSample[] = Array.from({ length: 40 }, (_, n) => {
      const report = faceOn((n * 7) % 35, (n * 3) % 12, 2 + (n % 5) * 0.6);
      const sample: CalibrationSample = { file: `${n}.json`, name: `clip ${n}`, coach: 0, report, reason: null };
      return { ...sample, coach: appScore(sample, coach)! };
    });
    const before = meanError(samples)!, fitted = fitRubric(samples), after = meanError(samples, fitted)!;
    assert.ok(before > 8, `the default rubric should disagree (${before})`);
    assert.ok(after < 1.5, `the fit should nearly match the coach (${after})`);
    assert.ok(fitted.head.free < SCORE_RUBRIC.head.free && fitted.head.severe < SCORE_RUBRIC.head.severe);
    assert.ok(crossValidate(samples)! < before);
    assert.equal(crossValidate(samples.slice(0, 9)), null); // too few to tell
    const blocked = { ...samples[0]!, report: null };
    assert.equal(meanError([blocked]), null); // unscorable clips never count as agreement
  });

  it("saves one file per clip name inside the folder and refuses to delete outside it", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "calibration-"));
    assert.equal(calibrationFile("../../Adam Scott DTL.MOV"), "adam-scott-dtl-mov.json");
    const model = { v: 1 } as unknown as PoseModel;
    saveCalibrationSwing({ name: "../../Adam Scott DTL.MOV", score: 70, savedAt: "2026-11-09", model }, dir);
    saveCalibrationSwing({ name: "../../Adam Scott DTL.MOV", score: 92, note: "Great", savedAt: "2026-11-09", model }, dir);
    const { swings, skipped } = loadCalibrationSwings(dir);
    assert.deepEqual(swings.map(({ file, score, note }) => ({ file, score, note })), [{ file: "adam-scott-dtl-mov.json", score: 92, note: "Great" }]);
    assert.deepEqual(skipped, []);
    assert.throws(() => deleteCalibrationSwing("../package.json", dir));
    deleteCalibrationSwing("adam-scott-dtl-mov.json", dir);
    assert.equal(loadCalibrationSwings(dir).swings.length, 0);
    assert.deepEqual(loadCalibrationSwings(path.join(dir, "missing")), { swings: [], skipped: [] });
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreSwing } from "./swing-score";
import type { MotionReading, MotionReport, MotionView } from "./motion-analysis";

function report(view: MotionView = "face_on"): MotionReport {
  const row = (id: string, value: number, unit: MotionReading["unit"]): MotionReading => ({ id, value, unit, label: id, note: "Observed", phase: id.endsWith("address") ? "address" : id.endsWith("top") ? "top" : "impact", time: id.endsWith("top") ? 0.8 : 1.1 });
  return { view, usable: true, phases: { address: 0, top: 20, impact: 30 }, timing: { source: "hands", uncertainty: 0.02 },
    quality: { visible: 32, total: 32, coverage: 1, cameraStable: true, largestGap: 0.04 }, warnings: [], observations: [], summary: "Tracked",
    tempo: { backswing: 0.9, downswing: 0.3, ratio: 3, uncertainty: 0.02 },
    readings: [row("head_impact", 8, "% stance"), row("lift_top", 2, "% body height"), row("torso_address", 35, "° in picture"), row("torso_top", 35, "° in picture"), row("torso_impact", 30, "° in picture"), row("hips_impact", 2, "% body height")] };
}

describe("visible swing coaching score", () => {
  it("gives an explicit weighted score and ranks the largest weighted deduction first", () => {
    const motion = report();
    motion.readings.find((row) => row.id === "head_impact")!.value = 40;
    motion.readings.find((row) => row.id === "lift_top")!.value = 15;
    const score = scoreSwing(motion);
    assert.equal(score.total, 30);
    assert.deepEqual(score.priorities.map((item) => item.id), ["head", "height"]);
    assert.equal(score.priorities[0]!.time, 1.1);
    assert.ok(score.priorities.every((item) => item.cue && item.check && item.evidence));
  });
  it("does not turn good visibility, missing measurements or a moved camera into a swing score", () => {
    const empty = report(); empty.readings = []; empty.tempo = null;
    assert.equal(scoreSwing(empty).total, null);
    for (const change of [{ cameraStable: false }, { coverage: 0.84 }, { largestGap: 0.15 }]) {
      const motion = report(); Object.assign(motion.quality, change);
      assert.equal(scoreSwing(motion).total, null);
    }
    assert.equal(scoreSwing(report("other")).total, null);
    const unresolved = report(); unresolved.phases = null;
    assert.equal(scoreSwing(unresolved).total, null);
  });
  it("uses observed height bounds, shows partial coverage, and never treats omissions as perfect", () => {
    const motion = report(); motion.tempo = null;
    motion.readings.find((row) => row.id === "head_impact")!.value = 40;
    assert.equal(scoreSwing(motion).total, 43); // (0*40 + 100*30) / 70
    assert.equal(scoreSwing(motion).missing.length, 1);
    motion.readings.find((row) => row.id === "lift_top")!.range = [0, 10];
    assert.equal(scoreSwing(motion).total, 19);
    assert.deepEqual(scoreSwing(motion).totalRange, [19, 43]);
    assert.deepEqual(scoreSwing(motion).components.find((item) => item.id === "height")?.scoreRange, [45, 100]);
    assert.equal(scoreSwing(motion).reviews[0]?.id, "height");
    assert.equal(scoreSwing(motion).priorities.some((item) => item.id === "height"), false);
  });
  it("scores a clear body with a hidden hand transition while continuing to omit rhythm", () => {
    const motion = report();
    motion.timing = { source: "occluded_transition", uncertainty: 0.16, topWindow: [16, 24] };
    motion.tempo = null;
    motion.readings.find((row) => row.id === "lift_top")!.range = [1, 3];
    const score = scoreSwing(motion);
    assert.equal(score.total, 100);
    assert.deepEqual(score.totalRange, [100, 100]);
    assert.deepEqual(score.components.map((item) => item.id), ["head", "height"]);
    assert.equal(score.missing.length, 1);
    assert.match(score.missing[0]!, /hands are hidden/);
    assert.equal(score.reason, null);
  });
  it("accounts for zero-crossing height ranges and only recommends fixes supported throughout the range", () => {
    const motion = report(); motion.tempo = null;
    const lift = motion.readings.find((row) => row.id === "lift_top")!;
    lift.range = [-8, 8];
    let score = scoreSwing(motion);
    assert.deepEqual(score.totalRange, [85, 100]);
    assert.equal(score.reviews[0]?.id, "height");
    assert.equal(score.priorities.length, 0);
    lift.range = [-15, -12]; lift.value = -13;
    score = scoreSwing(motion);
    assert.deepEqual(score.totalRange, [57, 69]);
    assert.equal(score.priorities[0]?.id, "height");
    assert.equal(score.reviews.length, 0);
    for (const range of [[NaN, 3], [8, 2], [-Infinity, 8]] as [number, number][]) {
      lift.range = range;
      assert.equal(scoreSwing(motion).total, null);
    }
  });
  it("keeps a supported improvement priority when too few checks can produce an overall score", () => {
    const motion = report(); motion.tempo = null;
    motion.readings = motion.readings.filter((row) => row.id !== "lift_top");
    motion.readings.find((row) => row.id === "head_impact")!.value = 40;
    const score = scoreSwing(motion);
    assert.equal(score.total, null);
    assert.equal(score.priorities[0]?.id, "head");
    assert.match(score.reason!, /Movement analysis is complete/);
  });
  it("scores DTL posture and ball-side displacement, including mirrored and left-handed footage", () => {
    const motion = report("down_the_line");
    motion.readings.find((row) => row.id === "hips_impact")!.value = 12;
    motion.readings.find((row) => row.id === "torso_impact")!.value = 5;
    const right = scoreSwing(motion, "right");
    assert.equal(right.total, 30);
    assert.deepEqual(right.priorities.map((item) => item.id), ["posture", "hip_depth"]);
    assert.equal(scoreSwing(motion, "left").total, 65); // away from the ball is not penalized
    motion.readings.find((row) => row.id === "hips_impact")!.value = -12;
    assert.equal(scoreSwing(motion, "left").total, right.total);
    assert.equal(scoreSwing(motion).total, null); // no guessing the ball side
  });
  it("uses view-specific checks and continuous bounded deductions", () => {
    assert.equal(scoreSwing(report()).total, 100);
    assert.equal(scoreSwing(report("down_the_line"), "right").total, 100);
    const motion = report(); let previous = 100;
    for (const value of [12, 15, 20, 25, 40, 70]) {
      motion.readings.find((row) => row.id === "head_impact")!.value = value;
      const score = scoreSwing(motion).total!;
      assert.ok(score <= previous && score >= 0 && score <= 100); previous = score;
    }
    motion.readings.find((row) => row.id === "head_impact")!.unit = "% body height";
    assert.equal(scoreSwing(motion).total, null); // never substitute the wrong scale
  });

  it("requires a contact correction to hold across the observed head, posture and hip intervals", () => {
    const faceOn = report();
    const head = faceOn.readings.find((row) => row.id === "head_impact")!;
    head.value = 25; head.range = [8, 40];
    assert.equal(scoreSwing(faceOn).priorities.some((item) => item.id === "head"), false);
    assert.deepEqual(scoreSwing(faceOn).components.find((item) => item.id === "head")?.scoreRange, [0, 100]);
    head.range = [-40, -25];
    assert.equal(scoreSwing(faceOn).priorities[0]?.id, "head");
    head.range = [-40, 40];
    assert.equal(scoreSwing(faceOn).priorities.length, 0); // crosses setup

    const behind = report("down_the_line");
    const torso = behind.readings.find((row) => row.id === "torso_impact")!;
    const hip = behind.readings.find((row) => row.id === "hips_impact")!;
    torso.value = 5; torso.range = [5, 30];
    hip.value = 12; hip.range = [-2, 12];
    let score = scoreSwing(behind, "right");
    assert.equal(score.priorities.length, 0);
    assert.deepEqual(score.reviews.map((item) => item.id), ["posture", "hip_depth"]);
    torso.range = [5, 15]; hip.range = [8, 12];
    score = scoreSwing(behind, "right");
    assert.deepEqual(score.priorities.map((item) => item.id), ["hip_depth", "posture"]);
    hip.value = -12; hip.range = [-12, -8];
    assert.deepEqual(scoreSwing(behind, "left").components.find((item) => item.id === "hip_depth")?.scoreRange,
      score.components.find((item) => item.id === "hip_depth")?.scoreRange);
  });

  it("uses the entire timing range before calling rhythm rushed and rejects invalid ranges", () => {
    const motion = report();
    motion.tempo!.ratio = 5;
    motion.tempo!.ratioRange = [3.5, 6];
    assert.equal(scoreSwing(motion).priorities.length, 0);
    assert.equal(scoreSwing(motion).reviews[0]?.id, "tempo");
    motion.tempo!.ratioRange = [4.8, 6];
    assert.equal(scoreSwing(motion).priorities[0]?.id, "tempo");
    motion.tempo!.ratio = 1;
    motion.tempo!.ratioRange = [0.8, 1.2];
    assert.equal(scoreSwing(motion).priorities[0]?.id, "tempo");
    for (const range of [[NaN, 6], [6, 4], [0, 5], [1, Infinity]] as [number, number][]) {
      motion.tempo!.ratioRange = range;
      assert.equal(scoreSwing(motion).components.some((item) => item.id === "tempo"), false);
    }
  });
});

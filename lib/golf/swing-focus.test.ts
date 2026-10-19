import assert from "node:assert/strict";
import { it } from "node:test";
import type { MotionReading, MotionReport } from "./motion-analysis";
import { getSwingFocus } from "./swing-focus";

function report(view: MotionReport["view"] = "face_on"): MotionReport {
  const row = (id: string, value: number, unit: MotionReading["unit"]): MotionReading => ({
    id, value, unit, label: id, note: "Observed", phase: id.endsWith("address") ? "address" : id.endsWith("top") ? "top" : "impact", time: 1,
  });
  return { view, usable: true, phases: { address: 0, top: 20, impact: 30 }, timing: { source: "hands", uncertainty: 0.02 },
    quality: { visible: 32, total: 32, coverage: 1, cameraStable: true, largestGap: 0.04 }, warnings: [], observations: [], summary: "Tracked",
    tempo: { backswing: 0.9, downswing: 0.3, ratio: 3, uncertainty: 0.02 },
    readings: [row("head_impact", 40, "% stance"), row("lift_top", 15, "% body height"),
      row("torso_address", 35, "° in picture"), row("torso_impact", 5, "° in picture")] };
}

it("shows only the largest supported issue and a procedure for that issue", () => {
  const motion = report();
  const focus = getSwingFocus(motion);
  assert.equal(focus.id, "head");
  assert.equal(focus.steps.length, 3);
  assert.match(focus.issue, /head/);
  assert.match(focus.steps.join(" "), /sideways/);
  assert.equal("priorities" in focus, false);
  motion.readings.find((row) => row.id === "head_impact")!.value = 8;
  assert.equal(getSwingFocus(motion).id, "height");
  motion.readings.find((row) => row.id === "lift_top")!.value = -15;
  assert.match(getSwingFocus(motion).issue, /dip/);
});

it("supports posture from a down-the-line view without requiring face-on footage", () => {
  const focus = getSwingFocus(report("down_the_line"));
  assert.equal(focus.id, "posture");
  assert.match(focus.steps.join(" "), /room for your arms/);
});

it("does not invent faults for poor tracking, missing evidence, or uncertain positions", () => {
  for (const change of [{ cameraStable: false }, { coverage: 0.8 }, { largestGap: 0.2 }]) {
    const motion = report(); Object.assign(motion.quality, change);
    const focus = getSwingFocus(motion);
    assert.equal(focus.id, null);
    assert.match(focus.issue, /does not show/);
    assert.match(focus.steps.join(" "), /Record one swing/);
  }
  const motion = report();
  motion.readings.find((row) => row.id === "head_impact")!.value = 8;
  motion.readings.find((row) => row.id === "lift_top")!.range = [0, 15];
  assert.equal(getSwingFocus(motion).id, null);
  motion.readings = [];
  motion.tempo = null;
  assert.equal(getSwingFocus(motion).id, null);
});

it("does not prescribe a technique change when the visible checks show no clear issue", () => {
  const motion = report();
  motion.readings.find((row) => row.id === "head_impact")!.value = 8;
  motion.readings.find((row) => row.id === "lift_top")!.value = 2;
  const focus = getSwingFocus(motion);
  assert.equal(focus.id, null);
  assert.match(focus.issue, /No clear problem/);
  assert.match(focus.steps[0]!, /Keep your current swing/);
});

it("keeps a supported issue when an overall score is unavailable and gives tempo the correct direction", () => {
  const motion = report(); motion.tempo = null;
  motion.readings = motion.readings.filter((row) => row.id === "head_impact");
  assert.equal(getSwingFocus(motion).id, "head");
  const rhythm = report();
  rhythm.readings.find((row) => row.id === "head_impact")!.value = 8;
  rhythm.readings.find((row) => row.id === "lift_top")!.value = 2;
  rhythm.tempo!.ratio = 1;
  assert.match(getSwingFocus(rhythm).issue, /backswing is rushed/);
  rhythm.tempo!.ratio = 5;
  assert.match(getSwingFocus(rhythm).issue, /downswing is rushed/);
});

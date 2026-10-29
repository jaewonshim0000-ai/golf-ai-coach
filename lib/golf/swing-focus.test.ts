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
  assert.equal(focus.status, "issue");
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

it("keeps readable issues when an unrelated gap or partial coverage prevents an overall score", () => {
  for (const change of [{ coverage: 0.8 }, { largestGap: 0.2 }]) {
    const motion = report(); Object.assign(motion.quality, change);
    const focus = getSwingFocus(motion);
    assert.equal(focus.id, "head");
    assert.equal(focus.status, "issue");
  }
});

it("asks for a clearer recording for an uncertain top instead of inventing a fault", () => {
  const motion = report();
  motion.readings.find((row) => row.id === "head_impact")!.value = 8;
  motion.readings.find((row) => row.id === "lift_top")!.range = [0, 15];
  const focus = getSwingFocus(motion);
  assert.equal(focus.id, null);
  assert.equal(focus.status, "needs_input");
  assert.match(focus.issue, /hip position near the top/);
  assert.match(focus.steps.join(" "), /slow motion/);
  assert.doesNotMatch(focus.steps.join(" "), /Adjust swing timing|Shorten/);
  motion.readings = [];
  motion.tempo = null;
  assert.equal(getSwingFocus(motion).id, null);
});

it("withholds displacement for camera motion but retains independent posture and rhythm", () => {
  const faceOn = report(); faceOn.quality.cameraStable = false; faceOn.tempo = null;
  assert.equal(getSwingFocus(faceOn).id, null);
  assert.match(getSwingFocus(faceOn).issue, /Camera or foot movement/);
  faceOn.tempo = { backswing: 0.9, downswing: 0.2, ratio: 5, uncertainty: 0.02 };
  assert.equal(getSwingFocus(faceOn).id, "tempo");
  const behind = report("down_the_line"); behind.quality.cameraStable = false;
  assert.equal(getSwingFocus(behind).id, "posture");
});

it("explains what was missing and asks for a clearer recording, never a manual correction", () => {
  const unknownView = getSwingFocus(report("other"));
  assert.equal(unknownView.status, "needs_input");
  assert.match(unknownView.issue, /camera angle/);
  const incomplete = report(); incomplete.phases = null; incomplete.usable = false;
  const timing = getSwingFocus(incomplete);
  assert.match(timing.issue, /positions could not be identified/);
  assert.match(timing.steps.join(" "), /analyzed automatically/);
  incomplete.quality.coverage = 0.4;
  const hidden = getSwingFocus(incomplete);
  assert.match(hidden.issue, /body could not be tracked/);
  for (const focus of [unknownView, timing, hidden]) assert.doesNotMatch(focus.steps.join(" "), /Adjust swing timing|Camera view|Shorten|Review again/);
  // An unusable report has not necessarily evaluated camera stability yet.
  const unreadable = report(); unreadable.usable = false; unreadable.quality.cameraStable = false;
  assert.match(getSwingFocus(unreadable).issue, /key body positions/);
  assert.doesNotMatch(getSwingFocus(unreadable).issue, /Camera or foot movement/);
});

it("does not prescribe a technique change when the visible checks show no clear issue", () => {
  const motion = report();
  motion.readings.find((row) => row.id === "head_impact")!.value = 8;
  motion.readings.find((row) => row.id === "lift_top")!.value = 2;
  const focus = getSwingFocus(motion);
  assert.equal(focus.id, null);
  assert.equal(focus.status, "clear");
  assert.match(focus.issue, /do not show a clear swing fault/);
  assert.match(focus.steps[0]!, /Keep your current swing/);
});

it("does not turn one missing check into a failed analysis when the readable checks look fine", () => {
  const faceOn = report(); faceOn.tempo = null;
  faceOn.readings.find((row) => row.id === "head_impact")!.value = 8;
  faceOn.readings.find((row) => row.id === "lift_top")!.value = 2;
  assert.equal(getSwingFocus(faceOn).status, "clear");
  const behind = report("down_the_line");
  behind.readings.find((row) => row.id === "torso_impact")!.value = 30;
  // No ball-side selection: hip space is unavailable, but posture and rhythm are readable.
  assert.equal(getSwingFocus(behind).status, "clear");
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

it("asks for the relevant contact or timing correction when a sampled fault is uncertain", () => {
  const motion = report();
  motion.readings.find((row) => row.id === "head_impact")!.range = [8, 40];
  motion.readings.find((row) => row.id === "lift_top")!.value = 2;
  assert.match(getSwingFocus(motion).issue, /head position around contact/);
  assert.equal(getSwingFocus(motion).status, "needs_input");
  motion.tempo!.ratio = 5; motion.tempo!.ratioRange = [3.5, 6];
  motion.readings.find((row) => row.id === "head_impact")!.range = [0, 8];
  assert.match(getSwingFocus(motion).issue, /swing timing/);
  motion.tempo!.ratioRange = [4.8, 6];
  assert.equal(getSwingFocus(motion).id, "tempo");
  // A supported body issue still takes priority over an uncertain rhythm.
  motion.readings.find((row) => row.id === "head_impact")!.range = [30, 40];
  motion.tempo!.ratioRange = [3.5, 6];
  assert.equal(getSwingFocus(motion).id, "head");
});

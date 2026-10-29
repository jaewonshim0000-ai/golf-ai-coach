import assert from "node:assert/strict";
import { it } from "node:test";
import { faceOnSwing } from "./__fixtures__/face-on";
import { buildVideoModel } from "./video-review";
import { reviewSwing } from "../swing/review";
import { SWING_PHASES, swingBreakdown } from "./swing-breakdown";

it("splits a timed swing into six contiguous phases with a hand trace and extra positions", () => {
  const model = buildVideoModel(faceOnSwing(), { aspect: 1, view: "face_on", handedness: "right" });
  const report = reviewSwing(model).report;
  const breakdown = swingBreakdown(model, report)!;
  assert.deepEqual(breakdown.phases.map((phase) => phase.name), [...SWING_PHASES]);
  breakdown.phases.forEach((phase, n) => {
    assert.ok(phase.end >= phase.start);
    if (n) assert.equal(phase.start, breakdown.phases[n - 1]!.end);
  });
  const phase = (name: string) => breakdown.phases.find((item) => item.name === name)!;
  // The fixture's top is at 1.44 s and contact at 1.76 s; the finish is the last, highest hand position.
  assert.ok(phase("top").start <= 1.44 && phase("top").end >= 1.44);
  assert.ok(phase("impact").start <= 1.76 && phase("impact").end >= 1.76);
  assert.ok(Math.abs(phase("follow_through").end - 2.4) < 0.01);
  assert.equal(breakdown.handPath.length, 61);
  const value = (id: string) => breakdown.readings.find((row) => row.id === id)?.value;
  assert.ok(Math.abs(value("hands_top")! - 92) < 1, "hands 0.69 above the ankles of a 0.75-high body");
  assert.ok(value("hands_finish")! > value("hands_top")!);
  assert.ok(Math.abs(value("hips_finish")! - 50) < 1, "hips centred between the feet at the finish");
  assert.ok(value("knee_address")! > 150);
  assert.equal(swingBreakdown(model, { ...report, phases: null }), null);
});

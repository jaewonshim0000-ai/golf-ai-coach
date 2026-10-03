import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { DRILLS_BY_ID } from "../seed/drills";
import { PRACTICE_GOALS, earnedTolerance, goalForWeakness, missPattern } from "./goals";
import { PLAN_LENGTHS, buildPlan } from "./plan";
import { PRACTICE_DRILL_IDS } from "./drill-priorities";

const goal = (id: string) => PRACTICE_GOALS.find((candidate) => candidate.id === id)!;

describe("practice plans", () => {
  it("fills the time asked for, with real drills, none twice", () => {
    for (const minutes of PLAN_LENGTHS) {
      for (const { id } of PRACTICE_GOALS) {
        const plan = buildPlan(minutes, id);
        assert.equal(plan.items.reduce((sum, item) => sum + item.duration, 0), minutes);
        assert.ok(plan.items.every((item) => DRILLS_BY_ID.has(item.drill_id)), `${id} ${minutes}`);
        assert.equal(new Set(plan.items.map((item) => item.drill_id)).size, plan.items.length);
        assert.ok(plan.items.some((item) => item.block === "skill" && item.drill_id === `drill_${id}`));
      }
    }
  });

  it("warms up first and ends under pressure once there is time for it", () => {
    const plan = buildPlan(60, "iron_accuracy");
    assert.equal(plan.items[0]!.block, "warm_up");
    assert.equal(plan.items.at(-1)!.block, "pressure");
    assert.equal(buildPlan(15, "iron_accuracy").items.length, 2);
  });

  it("uses matching saved drills without replacing the goal test or repeating exercises", () => {
    const plan = buildPlan(60, "driver_accuracy", null, ["drill_gate_putting", "drill_driver_fairway_finder", "drill_driver_pressure_ladder"]);
    assert.ok(plan.items.some((item) => item.drill_id === "drill_driver_fairway_finder"));
    assert.ok(plan.items.some((item) => item.drill_id === "drill_driver_pressure_ladder"));
    assert.ok(!plan.items.some((item) => item.drill_id === "drill_gate_putting"));
    assert.ok(plan.items.some((item) => item.block === "skill" && item.drill_id === "drill_driver_accuracy"));
    assert.equal(new Set(plan.items.map((item) => item.drill_id)).size, plan.items.length);
    assert.equal(plan.items.reduce((sum, item) => sum + item.duration, 0), 60);
  });

  it("keeps every selected-drill combination valid across all goals and lengths", () => {
    for (const minutes of PLAN_LENGTHS) {
      for (const { id } of PRACTICE_GOALS) {
        for (const selected of [PRACTICE_DRILL_IDS, [...PRACTICE_DRILL_IDS].reverse(), ...PRACTICE_DRILL_IDS.map((drill) => [drill])]) {
          const plan = buildPlan(minutes, id, null, [...selected]);
          assert.ok(plan.items.every((item) => DRILLS_BY_ID.has(item.drill_id)));
          assert.equal(new Set(plan.items.map((item) => item.drill_id)).size, plan.items.length);
          assert.equal(plan.items.reduce((sum, item) => sum + item.duration, 0), minutes);
        }
      }
    }
  });
});

describe("the target band", () => {
  it("starts at the goal's default", () => {
    assert.equal(earnedTolerance(goal("iron_accuracy"), null), 10);
    assert.equal(earnedTolerance(goal("putting_conversion"), [1, 2]), null);
  });

  it("tightens when the last session beat the band", () => {
    // Seven of these ten are within 5 yards.
    assert.equal(earnedTolerance(goal("iron_accuracy"), [1, -2, 3, 0, 4, -5, 2, 11, -14, 9]), 5);
  });

  it("gives some back after a bad session, but never past the loosest band", () => {
    assert.equal(earnedTolerance(goal("iron_accuracy"), [13, -12, 11, 0, 14, -9, 2, 30, -24, 19]), 15);
    assert.equal(earnedTolerance(goal("iron_accuracy"), Array(10).fill(40)), 15);
  });
});

describe("reading a tapped session", () => {
  it("scores chips on distance from the hole and names the lean", () => {
    const pattern = missPattern([[3, 4], [0, -2], [1, -8]], goal("chip_accuracy"), 6);
    assert.equal(pattern!.successes, 2);
    assert.match(pattern!.summary, /short/);
  });

  it("scores full swings on the sideways miss only", () => {
    const pattern = missPattern([[4, 30], [-4, -30], [12, 0]], goal("iron_accuracy"), 10);
    assert.equal(pattern!.successes, 2);
  });
});

describe("the goal for a weakness", () => {
  it("follows where the strokes go", () => {
    assert.equal(goalForWeakness({ category: "off_the_tee", key: "driver" }), "driver_accuracy");
    assert.equal(goalForWeakness({ category: "approach", key: "50-75" }), "wedge_accuracy");
    assert.equal(goalForWeakness({ category: "approach", key: "150-175" }), "iron_accuracy");
    assert.equal(goalForWeakness({ category: "putting", key: "3-6" }), "putting_conversion");
  });
});

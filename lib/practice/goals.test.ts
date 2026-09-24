import { test } from "node:test";
import assert from "node:assert/strict";
import { dispersion, QUICK_DRILLS } from "./goals";
import { drillAttemptSchema, practiceSessionSchema } from "../validation/schemas";

test("dispersion keeps misses from cancelling out and includes boundary shots", () => {
  assert.deepEqual(dispersion([-10, 10, 0, 15, -5], 10), {
    count: 5, successes: 4, averageMiss: 8, bias: 2, spread: 25,
  });
  assert.equal(dispersion([], 5), null);
  assert.equal(dispersion([NaN], 5), null);
});

test("every quick goal has ten balls, including wedges, chipping and putting", () => {
  assert.ok(["wedges", "chipping", "putting"].every((category) => QUICK_DRILLS.some((drill) => drill.category === category)));
  assert.ok(QUICK_DRILLS.every((drill) => drill.recommended_reps === 10));
});

test("practice takes a known goal and length, and rejects invalid shot data", () => {
  const practice = { minutes: "30", goal: "wedge_accuracy", scheduled_for: "2026-09-20" };
  assert.ok(practiceSessionSchema.safeParse(practice).success);
  assert.equal(practiceSessionSchema.safeParse({ ...practice, minutes: "45" }).success, false);
  assert.equal(practiceSessionSchema.safeParse({ ...practice, goal: "drill_x" }).success, false);
  const attempt = { session_id: "practice", drill_id: "drill", attempts: 10, successes: 7, shot_offsets: [Infinity] };
  assert.equal(drillAttemptSchema.safeParse(attempt).success, false);
  assert.equal(drillAttemptSchema.safeParse({ ...attempt, shot_offsets: Array(41).fill(0) }).success, false);
  assert.equal(drillAttemptSchema.safeParse({ ...attempt, shot_offsets: null, shot_points: [[1, 2, 3]] }).success, false);
  assert.ok(drillAttemptSchema.safeParse({ ...attempt, shot_offsets: null, shot_points: [[1, -2]] }).success);
});

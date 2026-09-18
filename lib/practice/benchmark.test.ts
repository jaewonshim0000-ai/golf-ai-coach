import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { Drill, DrillAttempt } from "../../types/practice";
import { benchmarkFor, benchmarkNote } from "./benchmark";

const drill: Drill = {
  id: "drill_clock_putting",
  name: "10-Foot Clock Drill",
  category: "putting",
  sub_category: null,
  description: "Ten putts from ten feet.",
  instructions: ["Place ten balls in a circle"],
  skill_trained: "short_putt_conversion",
  difficulty: "intermediate",
  recommended_duration: 12,
  recommended_reps: 10,
  equipment_required: [],
  clubs: ["putter"],
  metric_to_track: "Putts holed",
  metric_unit: "percent",
  scoring_method: "percentage",
  success_threshold: 0.6,
  progression_level: null,
  regression_level: null,
};

function attempt(successes: number, attempts: number, on: string): DrillAttempt {
  return {
    id: `a_${on}`,
    user_id: "u1",
    session_id: "s1",
    practice_item_id: null,
    drill_id: drill.id,
    attempts,
    successes,
    score: successes / attempts,
    raw_value: null,
    notes: null,
    completed_at: `${on}T18:00:00.000Z`,
  };
}

describe("drill benchmarks", () => {
  it("states the standard as a count, not a rate", () => {
    assert.equal(benchmarkFor(drill, []).label, "Make at least 6 of 10");
  });

  it("rounds the standard up, so a 60% bar is never handed out cheaper", () => {
    // 0.6 of 9 is 5.4: the standard is 6, not 5.
    const nine = benchmarkFor({ ...drill, recommended_reps: 9 }, []);
    assert.equal(nine.target, 6);
  });

  it("says nothing about a best attempt before there is one", () => {
    const benchmark = benchmarkFor(drill, []);
    assert.equal(benchmark.best, null);
    assert.equal(benchmark.beaten, false);
    assert.equal(benchmarkNote(benchmark), null);
  });

  it("notes a result that beats the standard, and by how much", () => {
    const benchmark = benchmarkFor(drill, [attempt(5, 10, "2026-09-01"), attempt(7, 10, "2026-09-08")]);
    assert.equal(benchmark.beaten, true);
    assert.equal(benchmark.margin, 1);
    assert.match(benchmarkNote(benchmark)!, /7 of 10/);
  });

  it("keeps the best attempt, not the latest one", () => {
    const benchmark = benchmarkFor(drill, [attempt(8, 10, "2026-09-01"), attempt(4, 10, "2026-09-08")]);
    assert.equal(benchmark.best?.successes, 8);
    assert.equal(benchmark.latest?.successes, 4);
    assert.equal(benchmark.beaten, true);
  });

  it("compares on the rate, so a short attempt cannot inflate the margin", () => {
    // 7 of 8 is 87.5%, well past 60%, but it is only 2 clear over 10 reps.
    const benchmark = benchmarkFor(drill, [attempt(7, 8, "2026-09-08")]);
    assert.equal(benchmark.margin, 3);
    assert.equal(benchmark.best?.attempts, 8);
  });

  it("ignores attempts belonging to another drill", () => {
    const other = { ...attempt(10, 10, "2026-09-08"), drill_id: "drill_lag_ladder" };
    assert.equal(benchmarkFor(drill, [other]).sessions, 0);
  });
});

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { HoleResult, RoundSummaryStats } from "../../types/analytics";
import { ruleBasedRoundSummary } from "./insights";

function stats(patch: Partial<RoundSummaryStats> = {}): RoundSummaryStats {
  return {
    round_id: "r1",
    course_name: "Riverbend",
    played_on: "2026-09-22",
    score: 3,
    to_par: -1,
    holes_played: 1,
    sg_total: 1.0,
    sg_by_category: { off_the_tee: 0.05, approach: 0, around_the_green: 0, putting: 0.94 },
    fairways_hit: 1,
    fairway_opportunities: 1,
    greens_in_regulation: 1,
    putts: 1,
    penalties: 0,
    up_and_downs: 0,
    up_and_down_opportunities: 0,
    sand_saves: 0,
    sand_save_opportunities: 0,
    worst_hole: { hole_number: 1, strokes_gained: 0.99, par: 4, strokes: 3 },
    best_hole: { hole_number: 1, strokes_gained: 0.99, par: 4, strokes: 3 },
    ...patch,
  } as RoundSummaryStats;
}

function hole(shotGain: number): HoleResult {
  return {
    hole_number: 1,
    par: 4,
    strokes: 3,
    strokes_gained: shotGain,
    shots: [
      {
        hole_number: 1,
        starting_distance: 150,
        starting_unit: "yards",
        strokes_gained: shotGain,
      },
    ],
  } as unknown as HoleResult;
}

describe("round read-out", () => {
  it("does not file a hole that gained strokes under what cost you", () => {
    const summary = ruleBasedRoundSummary(stats(), [hole(0.4)]);
    assert.equal(
      summary.what_cost_you.some((line) => line.includes("Hole 1")),
      false,
    );
  });

  it("names the hole when it actually lost strokes", () => {
    const summary = ruleBasedRoundSummary(
      stats({ worst_hole: { hole_number: 7, strokes_gained: -2.3, par: 4, strokes: 7 } }),
      [hole(-1.1)],
    );
    assert.ok(summary.what_cost_you.some((line) => line.includes("Hole 7 cost you 2.30")));
  });

  it("refuses to call a shot that gained strokes the most expensive one", () => {
    const summary = ruleBasedRoundSummary(stats(), [hole(0.2)]);
    assert.match(summary.takeaway, /No single shot stood out/);
  });

  it("names the most expensive shot when there is one", () => {
    const summary = ruleBasedRoundSummary(stats(), [hole(-0.8)]);
    assert.match(summary.takeaway, /most expensive shot was on hole 1 from 150 yards/);
  });

  it("says nothing at all about a round with no shots", () => {
    const summary = ruleBasedRoundSummary(stats({ holes_played: 0 }), []);
    assert.equal(summary.what_cost_you.length, 0);
    assert.equal(summary.what_went_well.length, 0);
  });
});

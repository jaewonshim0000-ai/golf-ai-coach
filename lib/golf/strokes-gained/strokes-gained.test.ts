import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { Round, Shot } from "../../../types/rounds";
import { expectedStrokes, interpolate } from "../expected-strokes";
import { buildHoleResults, categorizeShot, scoreShot, summarizeRound } from "./index";

let counter = 0;
function shot(partial: Partial<Shot>): Shot {
  counter += 1;
  return {
    id: `s${counter}`,
    round_id: "r1",
    user_id: "u1",
    hole_number: 1,
    hole_par: 4,
    shot_number: 1,
    starting_location: "tee",
    starting_distance: 400,
    starting_unit: "yards",
    lie: "tee",
    club: "driver",
    shot_type: "tee",
    intended_target: null,
    ending_location: "fairway",
    ending_distance: 150,
    ending_unit: "yards",
    penalty_strokes: 0,
    penalty_type: "none",
    miss_direction: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

const round: Round = {
  id: "r1",
  user_id: "u1",
  course_id: "c1",
  course_name: "Test Links",
  played_on: "2026-01-01",
  tees: "white",
  holes_played: 1,
  score: null,
  conditions: [],
  notes: null,
  status: "complete",
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("expected strokes", () => {
  it("is zero when holed and monotonic with distance off the tee", () => {
    assert.equal(expectedStrokes({ lie: "holed", distance: 0, unit: "yards" }), 0);
    const near = expectedStrokes({ lie: "fairway", distance: 100, unit: "yards" });
    const far = expectedStrokes({ lie: "fairway", distance: 200, unit: "yards" });
    assert.ok(far > near, "200 yards should be harder than 100");
  });

  it("penalises rough and sand relative to fairway at the same distance", () => {
    const fairway = expectedStrokes({ lie: "fairway", distance: 160, unit: "yards" });
    const rough = expectedStrokes({ lie: "rough", distance: 160, unit: "yards" });
    const sand = expectedStrokes({ lie: "fairway_bunker", distance: 160, unit: "yards" });
    assert.ok(rough > fairway);
    assert.ok(sand > fairway);
  });

  it("uses feet on the green and yards elsewhere", () => {
    const tenFeet = expectedStrokes({ lie: "green", distance: 10, unit: "feet" });
    assert.ok(tenFeet > 1.5 && tenFeet < 1.8, `unexpected ${tenFeet}`);
    // 3.33 yards == 10 feet, so the unit conversion must agree.
    const sameInYards = expectedStrokes({ lie: "green", distance: 10 / 3, unit: "yards" });
    assert.ok(Math.abs(tenFeet - sameInYards) < 1e-9);
  });

  it("interpolates linearly between anchors", () => {
    const table = [
      [0, 0],
      [10, 10],
    ] as const;
    assert.equal(interpolate(table, 5), 5);
  });

  it("refuses to price a terminal lie", () => {
    assert.throws(() => expectedStrokes({ lie: "hazard", distance: 100, unit: "yards" }));
  });
});

describe("scoreShot", () => {
  it("credits a good drive", () => {
    const s = scoreShot(
      shot({ starting_distance: 420, ending_location: "fairway", ending_distance: 140 }),
    );
    // E(tee 420) ~ 4.02, E(fairway 140) ~ 2.91 => +0.11
    assert.ok(s.strokes_gained > 0, `expected positive, got ${s.strokes_gained}`);
    assert.equal(s.sg_category, "off_the_tee");
  });

  it("charges a full stroke for a holed shot that took one stroke from a tap-in", () => {
    const s = scoreShot(
      shot({
        starting_location: "green",
        starting_distance: 2,
        starting_unit: "feet",
        club: "putter",
        shot_type: "putt",
        ending_location: "holed",
        ending_distance: 0,
        ending_unit: "feet",
      }),
    );
    // E(2ft) = 1.009, so making it gains only 0.009.
    assert.ok(Math.abs(s.strokes_gained - 0.009) < 0.002, `got ${s.strokes_gained}`);
    assert.equal(s.sg_category, "putting");
  });

  it("rewards a long putt made", () => {
    const s = scoreShot(
      shot({
        starting_location: "green",
        starting_distance: 30,
        starting_unit: "feet",
        club: "putter",
        shot_type: "putt",
        ending_location: "holed",
        ending_distance: 0,
        ending_unit: "feet",
      }),
    );
    assert.ok(s.strokes_gained > 0.9, `got ${s.strokes_gained}`);
  });

  it("subtracts penalty strokes", () => {
    const clean = scoreShot(
      shot({ starting_distance: 400, ending_location: "rough", ending_distance: 170 }),
    );
    const penalised = scoreShot(
      shot({
        starting_distance: 400,
        ending_location: "rough",
        ending_distance: 170,
        penalty_strokes: 1,
        penalty_type: "water",
      }),
    );
    assert.ok(Math.abs(clean.strokes_gained - penalised.strokes_gained - 1) < 1e-9);
  });

  it("forces at least one penalty stroke when the ball finished out of bounds", () => {
    const s = scoreShot(
      shot({
        starting_distance: 400,
        ending_location: "out_of_bounds",
        ending_distance: 400,
        penalty_strokes: 0,
      }),
    );
    assert.ok(s.strokes_gained < -1, `OB with no recorded penalty should still cost: ${s.strokes_gained}`);
  });

  it("classifies a greenside chip as around the green, not approach", () => {
    const s = scoreShot(
      shot({
        shot_number: 3,
        starting_location: "rough",
        starting_distance: 20,
        club: "sw",
        shot_type: "chip",
        ending_location: "green",
        ending_distance: 8,
        ending_unit: "feet",
      }),
    );
    assert.equal(s.sg_category, "around_the_green");
  });

  it("classifies a par-3 tee shot as approach", () => {
    const s = scoreShot(
      shot({ hole_par: 3, starting_distance: 170, club: "6_iron", shot_type: "tee" }),
    );
    assert.equal(categorizeShot(s), "approach");
  });

  it("classifies a bunker shot from 60 yards as approach, not short game", () => {
    const s = scoreShot(
      shot({
        starting_location: "fairway_bunker",
        starting_distance: 60,
        shot_number: 2,
        club: "sw",
        shot_type: "approach",
        ending_location: "green",
        ending_distance: 25,
        ending_unit: "feet",
      }),
    );
    assert.equal(s.sg_category, "approach");
  });
});

describe("buildHoleResults", () => {
  const par4 = [
    shot({
      hole_number: 7,
      shot_number: 1,
      starting_distance: 400,
      ending_location: "fairway",
      ending_distance: 152,
    }),
    shot({
      hole_number: 7,
      shot_number: 2,
      starting_location: "fairway",
      starting_distance: 152,
      club: "7_iron",
      shot_type: "approach",
      ending_location: "rough",
      ending_distance: 32,
      miss_direction: "right",
    }),
    shot({
      hole_number: 7,
      shot_number: 3,
      starting_location: "rough",
      starting_distance: 32,
      club: "sw",
      shot_type: "pitch",
      ending_location: "green",
      ending_distance: 18,
      ending_unit: "feet",
    }),
    shot({
      hole_number: 7,
      shot_number: 4,
      starting_location: "green",
      starting_distance: 18,
      starting_unit: "feet",
      club: "putter",
      shot_type: "putt",
      ending_location: "holed",
      ending_distance: 0,
      ending_unit: "feet",
    }),
  ];

  it("reconstructs the scorecard line", () => {
    const [hole] = buildHoleResults(par4);
    assert.ok(hole);
    assert.equal(hole.hole_number, 7);
    assert.equal(hole.strokes, 4);
    assert.equal(hole.score_to_par, 0);
    assert.equal(hole.putts, 1);
    assert.equal(hole.fairway_hit, true);
    assert.equal(hole.green_in_regulation, false);
    assert.equal(hole.up_and_down, true);
  });

  it("counts a green reached in regulation", () => {
    const gir = buildHoleResults([
      par4[0]!,
      shot({
        hole_number: 7,
        shot_number: 2,
        starting_location: "fairway",
        starting_distance: 152,
        club: "7_iron",
        shot_type: "approach",
        ending_location: "green",
        ending_distance: 22,
        ending_unit: "feet",
      }),
    ]);
    assert.equal(gir[0]?.green_in_regulation, true);
  });

  it("flags a sand save", () => {
    const holes = buildHoleResults([
      shot({
        hole_number: 3,
        hole_par: 3,
        shot_number: 1,
        starting_distance: 165,
        club: "6_iron",
        shot_type: "tee",
        ending_location: "greenside_bunker",
        ending_distance: 18,
      }),
      shot({
        hole_number: 3,
        hole_par: 3,
        shot_number: 2,
        starting_location: "greenside_bunker",
        starting_distance: 18,
        club: "sw",
        shot_type: "bunker",
        ending_location: "green",
        ending_distance: 5,
        ending_unit: "feet",
      }),
      shot({
        hole_number: 3,
        hole_par: 3,
        shot_number: 3,
        starting_location: "green",
        starting_distance: 5,
        starting_unit: "feet",
        club: "putter",
        shot_type: "putt",
        ending_location: "holed",
        ending_distance: 0,
        ending_unit: "feet",
      }),
    ]);
    assert.equal(holes[0]?.sand_save, true);
    assert.equal(holes[0]?.up_and_down, true);
  });

  it("adds penalty strokes to the hole score", () => {
    const holes = buildHoleResults([
      shot({
        hole_number: 5,
        shot_number: 1,
        starting_distance: 410,
        ending_location: "rough",
        ending_distance: 200,
        penalty_strokes: 1,
        penalty_type: "water",
      }),
      shot({
        hole_number: 5,
        shot_number: 2,
        starting_location: "rough",
        starting_distance: 200,
        club: "5_iron",
        shot_type: "approach",
        ending_location: "green",
        ending_distance: 30,
        ending_unit: "feet",
      }),
      shot({
        hole_number: 5,
        shot_number: 3,
        starting_location: "green",
        starting_distance: 30,
        starting_unit: "feet",
        club: "putter",
        shot_type: "putt",
        ending_location: "holed",
        ending_distance: 0,
        ending_unit: "feet",
      }),
    ]);
    assert.equal(holes[0]?.strokes, 4, "3 shots + 1 penalty");
    assert.equal(holes[0]?.penalties, 1);
  });
});

describe("summarizeRound", () => {
  it("handles an incomplete round without inventing holes", () => {
    const summary = summarizeRound(round, [
      shot({
        hole_number: 1,
        shot_number: 1,
        starting_distance: 400,
        ending_location: "fairway",
        ending_distance: 150,
      }),
      shot({
        hole_number: 1,
        shot_number: 2,
        starting_location: "fairway",
        starting_distance: 150,
        club: "8_iron",
        shot_type: "approach",
        ending_location: "green",
        ending_distance: 15,
        ending_unit: "feet",
      }),
      shot({
        hole_number: 1,
        shot_number: 3,
        starting_location: "green",
        starting_distance: 15,
        starting_unit: "feet",
        club: "putter",
        shot_type: "putt",
        ending_location: "holed",
        ending_distance: 0,
        ending_unit: "feet",
      }),
    ]);
    assert.equal(summary.holes_played, 1);
    assert.equal(summary.score, 3);
    assert.equal(summary.to_par, -1);
    assert.equal(summary.greens_in_regulation, 1);
  });

  it("returns an empty, non-fabricated summary when there are no shots", () => {
    const summary = summarizeRound(round, []);
    assert.equal(summary.holes_played, 0);
    assert.equal(summary.sg_total, 0);
    assert.equal(summary.score, null);
    assert.equal(summary.to_par, null);
    assert.equal(summary.best_hole, null);
  });

  it("splits strokes gained across all four categories", () => {
    const summary = summarizeRound(round, [
      shot({ hole_number: 1, shot_number: 1, ending_location: "fairway", ending_distance: 150 }),
      shot({
        hole_number: 1,
        shot_number: 2,
        starting_location: "fairway",
        starting_distance: 150,
        club: "7_iron",
        shot_type: "approach",
        ending_location: "rough",
        ending_distance: 25,
      }),
      shot({
        hole_number: 1,
        shot_number: 3,
        starting_location: "rough",
        starting_distance: 25,
        club: "sw",
        shot_type: "chip",
        ending_location: "green",
        ending_distance: 10,
        ending_unit: "feet",
      }),
      shot({
        hole_number: 1,
        shot_number: 4,
        starting_location: "green",
        starting_distance: 10,
        starting_unit: "feet",
        club: "putter",
        shot_type: "putt",
        ending_location: "holed",
        ending_distance: 0,
        ending_unit: "feet",
      }),
    ]);
    const sum =
      summary.sg_by_category.off_the_tee +
      summary.sg_by_category.approach +
      summary.sg_by_category.around_the_green +
      summary.sg_by_category.putting;
    assert.ok(Math.abs(sum - summary.sg_total) < 0.01, "category SG must sum to total SG");
  });
});

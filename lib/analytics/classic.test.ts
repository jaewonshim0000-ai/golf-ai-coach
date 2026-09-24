import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { HoleStat, Round } from "../../types/rounds";
import { classicStats, classicTrends, holeLines, lineFromStat } from "./classic";

const holes = [4, 3, 5, 4, 4, 3, 4, 5, 4].map((par, index) => ({ hole_number: index + 1, par, yards: 380 }));

const round = (stats: (HoleStat | null)[], played_on = "2026-09-01"): Round => ({
  id: `round_${played_on}`,
  user_id: "u",
  course_id: "c",
  course_name: "Test",
  played_on,
  tees: null,
  holes_played: stats.filter(Boolean).length,
  score: null,
  hole_stats: stats,
  conditions: [],
  notes: null,
  status: "complete",
  created_at: played_on,
});

const hole = (score: number, putts: number | null, fairway: HoleStat["fairway"] = null, penalties = 0): HoleStat => ({
  score,
  putts,
  fairway,
  penalties,
});

describe("a scorecard hole", () => {
  it("is a green in regulation when the putts leave two strokes to spare", () => {
    assert.equal(lineFromStat(hole(4, 2, "hit"), 4, 1).gir, true);
    assert.equal(lineFromStat(hole(4, 1, "left"), 4, 1).gir, false);
    assert.equal(lineFromStat(hole(3, 2), 3, 1).gir, true);
  });

  it("has no fairway on a par 3 and no green when the putts were not counted", () => {
    assert.equal(lineFromStat(hole(3, 2, "hit"), 3, 1).fairway, null);
    assert.equal(lineFromStat(hole(5, null, "hit"), 4, 1).gir, null);
  });
});

describe("classic stats", () => {
  const card = round([
    hole(4, 2, "hit"), // par, GIR
    hole(3, 1), // par, missed green, scrambled
    hole(6, 3, "right"), // bogey, GIR, three-putt
    hole(5, 1, "left", 1), // bogey, missed, penalty
    hole(3, 1, "hit"), // birdie, GIR
    hole(3, 2), // par, GIR
    hole(4, 1, "left"), // par, missed, scrambled
    hole(7, 2, "hit"), // double, missed
    null,
  ]);
  const stats = classicStats(holeLines(card, holes, []));

  it("counts fairways only where there was one", () => {
    assert.deepEqual([stats.fairways.made, stats.fairways.chances], [3, 6]);
  });

  it("counts greens, scrambling and putts per eighteen", () => {
    assert.deepEqual([stats.greens.made, stats.greens.chances], [4, 8]);
    assert.deepEqual([stats.scrambling.made, stats.scrambling.chances], [2, 4]);
    assert.equal(stats.puttsPerRound, (13 / 8) * 18);
    assert.equal(stats.threePuttsPerRound, (1 / 8) * 18);
  });

  it("averages by par and sorts the card into a mix", () => {
    assert.equal(stats.parAverage[3], 3);
    assert.deepEqual(stats.mix, { under: 1, par: 4, bogey: 2, double: 1 });
  });

  it("trends a stat per round, oldest first, skipping rounds too short to say", () => {
    const first = round(Array(9).fill(hole(4, 2, "left")), "2026-09-01");
    const later = round(Array(9).fill(hole(4, 2, "hit")), "2026-09-10");
    const short = round([hole(4, 2, "hit"), ...Array(8).fill(null)], "2026-09-05");
    const trends = classicTrends(
      [later, first, short].map((r) => ({ round: r, lines: holeLines(r, holes, []) })),
    );
    assert.deepEqual(
      trends.fairways.map((point) => [point.date, point.value]),
      [["2026-09-01", 0], ["2026-09-10", 100]],
    );
  });
});

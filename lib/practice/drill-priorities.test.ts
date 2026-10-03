import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { Round, ScoredShot } from "../../types/rounds";
import { demoData } from "../seed/demo-player";
import { DRILLS, DRILLS_BY_ID } from "../seed/drills";
import { cleanDrillPriorities, PRACTICE_DRILL_IDS, rankPracticeDrills } from "./drill-priorities";
import { practicePrioritiesSchema } from "../validation/schemas";

const seed = demoData();
const round = (id: string, date = "2026-10-01"): Round => ({
  ...seed.rounds[0]!, id, played_on: date, holes_played: 18, hole_stats: null,
});
function shots(id: string, category: ScoredShot["sg_category"], loss: number, count = 40): ScoredShot[] {
  return Array.from({ length: count }, (_, index) => ({
    ...seed.shots[0]!, id: `${id}-${index}`, round_id: id,
    club: category === "putting" ? "putter" : category === "off_the_tee" ? "driver" : "7_iron",
    starting_location: category === "putting" ? "green" : category === "off_the_tee" ? "tee" : "fairway",
    starting_distance: category === "putting" ? 4 : category === "off_the_tee" ? 400 : 150,
    starting_unit: category === "putting" ? "feet" : "yards",
    expected_before: 2, expected_after: 1, strokes_gained: loss, sg_category: category,
  }));
}

describe("practice drill priorities", () => {
  it("offers 30 real, unique drills and no unsupported claims for a new player", () => {
    const ranked = rankPracticeDrills(DRILLS, { rounds: [], shots: [], profile: null });
    assert.equal(ranked.length, 30);
    assert.equal(new Set(PRACTICE_DRILL_IDS).size, 30);
    assert.ok(PRACTICE_DRILL_IDS.every((id) => DRILLS_BY_ID.has(id)));
    assert.ok(ranked.every((entry) => entry.score === 0 && entry.reason === null && entry.signal === null));
  });

  it("puts drills for the largest course loss first and changes order when performance changes", () => {
    const rounds = [round("r1")];
    const ranked = rankPracticeDrills(DRILLS, {
      rounds, shots: [...shots("r1", "putting", -0.5), ...shots("r1", "off_the_tee", -0.1)], profile: seed.profile,
    });
    assert.equal(ranked[0]!.drill.id, "drill_putting_conversion");
    assert.match(ranked[0]!.reason!, /strokes lost/);
    const changed = rankPracticeDrills(DRILLS, {
      rounds, shots: [...shots("r1", "putting", 0.2), ...shots("r1", "off_the_tee", -0.6)], profile: seed.profile,
    });
    assert.equal(changed[0]!.drill.id, "drill_driver_accuracy");
  });

  it("uses only the ten latest played rounds, regardless of array order", () => {
    const rounds = Array.from({ length: 11 }, (_, index) => round(`r${index}`, `2026-09-${String(index + 1).padStart(2, "0")}`));
    const ranked = rankPracticeDrills(DRILLS, {
      rounds, shots: [...shots("r0", "putting", -10), ...shots("r10", "off_the_tee", -0.3)], profile: null,
    });
    assert.equal(ranked[0]!.drill.id, "drill_driver_accuracy");
    assert.equal(ranked.find((entry) => entry.drill.id === "drill_putting_conversion")!.reason, null);
  });

  it("does not recommend wedges for losses recorded with a numbered iron", () => {
    const ranked = rankPracticeDrills(DRILLS, {
      rounds: [round("r1")], shots: shots("r1", "approach", -0.5), profile: seed.profile,
    });
    assert.notEqual(ranked.find((entry) => entry.drill.id === "drill_iron_accuracy")!.reason, null);
    assert.equal(ranked.find((entry) => entry.drill.id === "drill_wedge_accuracy")!.reason, null);
  });

  it("ranks recorded scorecard misses without inventing strokes gained", () => {
    const card = { ...round("card"), hole_stats: Array.from({ length: 18 }, () => ({ score: 5, putts: 3, fairway: "hit" as const, penalties: 0 })) };
    const ranked = rankPracticeDrills(DRILLS, { rounds: [card], shots: [], profile: null });
    assert.equal(ranked[0]!.drill.id, "drill_lag_ladder");
    assert.match(ranked[0]!.reason!, /18 three-putt holes/);
    assert.doesNotMatch(ranked[0]!.reason!, /strokes lost/);
    const driver = rankPracticeDrills(DRILLS, {
      rounds: [{ ...card, hole_stats: [{ score: 5, putts: 2, fairway: "left", penalties: 0 }] }], shots: [], profile: null,
    });
    assert.equal(driver[0]!.drill.id, "drill_driver_accuracy");
    assert.equal(driver[0]!.signal, "early");
  });

  it("does not double-count scorecards or infer a skill weakness from a total score", () => {
    const ranked = rankPracticeDrills(DRILLS, {
      rounds: [{ ...round("r1"), hole_stats: [{ score: 8, putts: 4, fairway: "left", penalties: 1 }] }],
      shots: shots("r1", "putting", 0.2), profile: null,
    });
    assert.ok(ranked.every((entry) => entry.reason === null));
    const totalOnly = rankPracticeDrills(DRILLS, { rounds: [round("r1")], shots: [], profile: null });
    assert.ok(totalOnly.every((entry) => entry.reason === null));
  });

  it("labels small shot samples as early signals", () => {
    const ranked = rankPracticeDrills(DRILLS, { rounds: [round("r1")], shots: shots("r1", "off_the_tee", -0.5, 4), profile: null });
    assert.equal(ranked[0]!.signal, "early");
  });

  it("validates saved choices, deduplicates them, and permits clearing", () => {
    assert.deepEqual(cleanDrillPriorities(["drill_gate_putting", "made-up", null, "drill_gate_putting"]), ["drill_gate_putting"]);
    assert.deepEqual(cleanDrillPriorities("drill_gate_putting"), []);
    assert.equal(practicePrioritiesSchema.safeParse({ drill_ids: ["made-up"] }).success, false);
    assert.equal(practicePrioritiesSchema.safeParse({ drill_ids: [] }).success, true);
  });
});

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { holeShots, optionFor, type HoleRow } from "./hole-entry";
import { buildHoleResults } from "./strokes-gained";
import { shotSchema } from "../validation/schemas";

describe("hole entry", () => {
  // The hole in the screenshot: driver, fairway, bunker, one putt.
  const rows: HoleRow[] = [
    { start: "tee_driver", distance: 409, penalty: 0 },
    { start: "fairway", distance: 149, penalty: 0 },
    { start: "sand", distance: 10, penalty: 0 },
    { start: "green", distance: 6, penalty: 0 },
  ];

  it("chains each shot to where the next one started, ending in the hole", () => {
    const shots = holeShots("round_1", 1, 4, rows);
    assert.deepEqual(
      shots.map((shot) => [shot.starting_location, shot.starting_distance, shot.ending_location, shot.ending_distance]),
      [
        ["tee", 409, "fairway", 149],
        ["fairway", 149, "greenside_bunker", 10],
        ["greenside_bunker", 10, "green", 6],
        ["green", 6, "holed", 0],
      ],
    );
    assert.equal(shots[2]!.ending_unit, "feet");
    assert.equal(shots[0]!.club, "driver");
    for (const shot of shots) assert.equal(shotSchema.safeParse(shot).success, true);

    const [hole] = buildHoleResults(shots.map((shot, index) => ({ ...shot, id: `s${index}`, user_id: "u", created_at: "" })));
    assert.equal(hole!.strokes, 4);
    assert.equal(hole!.putts, 1);
    assert.equal(hole!.sand_save, true);
  });

  it("counts a penalty on the shot that caused it", () => {
    const shots = holeShots("round_1", 2, 3, [
      { start: "tee", distance: 160, penalty: 1 },
      { start: "rough", distance: 40, penalty: 0 },
      { start: "green", distance: 3, penalty: 0 },
    ]);
    const [hole] = buildHoleResults(shots.map((shot, index) => ({ ...shot, id: `s${index}`, user_id: "u", created_at: "" })));
    assert.equal(hole!.strokes, 4);
    assert.equal(shots[0]!.shot_type, "approach");
  });

  it("reopens stored shots as the options they were entered with", () => {
    for (const shot of holeShots("round_1", 1, 4, rows)) {
      assert.equal(optionFor(shot), rows[shot.shot_number - 1]!.start);
    }
  });
});

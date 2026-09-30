import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { holeSchema, holeShotsSchema, poseModelSchema, retimeSchema } from "./schemas";

describe("hole and scorecard validation", () => {
  it("needs a length for every shot of a hole", () => {
    const hole = { round_id: "round_1", hole_number: 1, par: 4, rows: [{ start: "tee_driver", distance: 409, penalty: 0 }] };
    assert.equal(holeShotsSchema.safeParse(hole).success, true);
    assert.equal(holeShotsSchema.safeParse({ ...hole, rows: [{ start: "green", distance: "", penalty: 0 }] }).success, false);
    assert.equal(holeShotsSchema.safeParse({ ...hole, rows: [] }).success, false);
  });

  it("accepts a real hole and rejects impossible ones", () => {
    const hole = { round_id: "round_1", hole_number: "4", score: "5", putts: "2", fairway: "left", penalties: "1" };
    assert.equal(holeSchema.safeParse(hole).success, true);
    assert.equal(holeSchema.safeParse({ ...hole, putts: null, fairway: null }).success, true);
    assert.equal(holeSchema.safeParse({ ...hole, score: "21" }).success, false);
    assert.equal(holeSchema.safeParse({ ...hole, putts: "5" }).success, false);
    assert.equal(holeSchema.safeParse({ ...hole, penalties: "5" }).success, false);
    assert.equal(holeSchema.safeParse({ ...hole, hole_number: "19" }).success, false);
  });
});

describe("3D swing model validation", () => {
  const frame = () => Array.from({ length: 33 }, () => [0.1, -0.2, 0.05, 0.9]);
  const model = (frames: unknown[], t = frames.map((_, index) => index / 10)) => ({
    swing_session_id: "swing_1",
    t,
    frames,
  });

  it("accepts a skeleton per frame", () => {
    assert.equal(poseModelSchema.safeParse(model([frame(), frame(), frame()])).success, true);
    assert.equal(
      poseModelSchema.safeParse({ ...model([frame(), frame(), frame()]), imageFrames: [frame(), frame(), frame()] }).success,
      true,
    );
    assert.equal(
      poseModelSchema.safeParse({
        ...model([frame(), frame(), frame(), frame()]),
        phases: { address: 0, top: 1, impact: 3 },
      }).success,
      true,
    );
  });

  it("rejects missing landmarks, impossible coordinates and mismatched times", () => {
    assert.equal(poseModelSchema.safeParse(model([frame(), frame(), frame().slice(1)])).success, false);
    const far = frame();
    far[0] = [40, 0, 0, 0.9];
    assert.equal(poseModelSchema.safeParse(model([frame(), frame(), far])).success, false);
    assert.equal(poseModelSchema.safeParse(model([frame(), frame(), frame()], [0, 0.1])).success, false);
    assert.equal(
      poseModelSchema.safeParse({ ...model([frame(), frame(), frame()]), imageFrames: [frame(), frame()] }).success,
      false,
    );
    assert.equal(
      poseModelSchema.safeParse({
        ...model([frame(), frame(), frame(), frame()]),
        phases: { address: 1, top: 1, impact: 3 },
      }).success,
      false,
    );
    assert.equal(
      poseModelSchema.safeParse({
        ...model([frame(), frame(), frame(), frame()]),
        phases: { address: 0, top: 2, impact: 4 },
      }).success,
      false,
    );
  });
});

describe("rebuilding and re-timing a stored swing", () => {
  const frame = () => Array.from({ length: 33 }, () => [0.1, -0.2, 0.05, 0.9]);
  const model = { swing_session_id: "swing_1", t: [0, 0.1, 0.2], frames: [frame(), frame(), frame()] };

  it("takes the video's shape only within what a phone records", () => {
    assert.equal(poseModelSchema.safeParse({ ...model, aspect: 9 / 16 }).success, true);
    assert.equal(poseModelSchema.safeParse({ ...model, aspect: 0 }).success, false);
    assert.equal(poseModelSchema.safeParse({ ...model, aspect: 20 }).success, false);
  });

  it("re-times only to three phases in order", () => {
    const retime = (address: number, top: number, impact: number) =>
      retimeSchema.safeParse({ swing_session_id: "swing_1", phases: { address, top, impact } }).success;
    assert.equal(retime(0, 40, 60), true);
    assert.equal(retime(40, 40, 60), false);
    assert.equal(retime(0, 60, 40), false);
  });
});

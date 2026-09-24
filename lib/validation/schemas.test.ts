import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { courseSchema, holeSchema, poseModelSchema } from "./schemas";

describe("course and scorecard validation", () => {
  const holes = (count: number, value: string) => Array.from({ length: count }, () => value);

  it("accepts both nine-hole and eighteen-hole courses", () => {
    assert.equal(courseSchema.safeParse({ name: "Short Course", pars: holes(9, "4"), yards: holes(9, "350") }).success, true);
    assert.equal(courseSchema.safeParse({ name: "Full Course", pars: holes(18, "4"), yards: holes(18, "350") }).success, true);
  });

  it("rejects incomplete and mismatched course cards", () => {
    assert.equal(courseSchema.safeParse({ name: "Twelve", pars: holes(12, "4"), yards: holes(12, "350") }).success, false);
    assert.equal(courseSchema.safeParse({ name: "Mismatch", pars: holes(9, "4"), yards: holes(18, "350") }).success, false);
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
  });

  it("rejects missing landmarks, impossible coordinates and mismatched times", () => {
    assert.equal(poseModelSchema.safeParse(model([frame(), frame(), frame().slice(1)])).success, false);
    const far = frame();
    far[0] = [40, 0, 0, 0.9];
    assert.equal(poseModelSchema.safeParse(model([frame(), frame(), far])).success, false);
    assert.equal(poseModelSchema.safeParse(model([frame(), frame(), frame()], [0, 0.1])).success, false);
  });
});

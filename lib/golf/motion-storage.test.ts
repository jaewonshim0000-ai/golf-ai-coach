import assert from "node:assert/strict";
import { test } from "node:test";
import { compactMotionModel, expandMotionModel } from "./motion-storage";
import { unpackFrames } from "./pose";
import { denseMotionModel } from "./__fixtures__/motion";

test("dense motion storage preserves observed x/y and visibility without inferred depth", () => {
  const original = denseMotionModel();
  original.cameraAngle = "down_the_line";
  original.ballSide = "left";
  const stored = compactMotionModel(original);
  assert.equal(stored.frames.length, 0);
  assert.equal(stored.imageFrames, undefined);
  assert.ok(stored.imageData!.length < 200000);
  const expanded = expandMotionModel(stored)!;
  assert.equal(expanded.ballSide, "left");
  assert.equal(expanded.cameraAngle, "down_the_line");
  assert.deepEqual(expanded.imageFrames, original.imageFrames!.map((frame) => frame.map(([x, y, , visibility]) => [x, y, 0, visibility])));
  assert.equal(unpackFrames(expanded).length, 128);
  assert.equal(unpackFrames(expanded)[65]!.imageLandmarks![15]!.x, original.imageFrames![65]![15]![0]);
  assert.equal(expandMotionModel({ ...stored, imageData: "invalid" }), null);
  assert.equal(expandMotionModel({ ...stored, imageData: "[[[0,0,1]]]" }), null);
  const legacy = { ...original, motionVersion: undefined };
  assert.equal(compactMotionModel(legacy), legacy);
  assert.equal(expandMotionModel(legacy), legacy);
});

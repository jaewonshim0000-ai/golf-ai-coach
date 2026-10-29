import assert from "node:assert/strict";
import { test } from "node:test";
import { planeLine, setupReadings, shaftAngle } from "./setup-marks";
import { compactMotionModel, expandMotionModel } from "./motion-storage";
import { LM, type PackedLandmark, type PoseModel } from "./pose";
import { setupMarksSchema } from "../validation/schemas";

// Right-hander filmed face on: the left (lead) ankle sits on screen right.
function faceOnModel(setup: PoseModel["setup"]): PoseModel {
  const frame = Array.from({ length: 33 }, (): PackedLandmark => [0.5, 0.5, 0, 1]);
  frame[LM.leftAnkle] = [0.6, 0.9, 0, 1];
  frame[LM.rightAnkle] = [0.4, 0.9, 0, 1];
  return { v: 1, handedness: "right", phases: { address: 0, top: 1, impact: 2 }, t: [0, 0.033, 0.066], frames: [],
    imageFrames: [frame, frame, frame], aspect: 0.5, cameraAngle: "face_on", motionVersion: 1, setup };
}

test("shaft angle and plane line are measured in the picture's own shape", () => {
  // 0.1 of the width at aspect 1 matches 0.1 of the height: 45°.
  assert.equal(Math.round(shaftAngle({ grip: [0.5, 0.5], clubhead: [0.6, 0.6] }, 1)), 45);
  // A portrait frame halves the horizontal run, so the shaft looks steeper.
  assert.equal(Math.round(shaftAngle({ grip: [0.5, 0.5], clubhead: [0.6, 0.6] }, 0.5)), 63);
  // Four shaft lengths from the clubhead, through the hands.
  const line = planeLine({ grip: [0.5, 0.5], clubhead: [0.6, 0.7] });
  assert.deepEqual(Object.values(line).map((value) => Math.round(value * 1000) / 1000), [0.6, 0.7, 0.2, -0.1]);
});

test("face-on readings place the ball against the stance midpoint", () => {
  const readings = setupReadings(faceOnModel({ t: 0.033, grip: [0.52, 0.6], clubhead: [0.5, 0.88], ball: [0.55, 0.88] }));
  assert.deepEqual(readings.map((row) => row.id), ["shaft_address", "ball_address"]);
  assert.match(readings[0]!.note, /toward the lead foot/);
  // Ball 0.05 toward the lead ankle on a 0.2-wide stance.
  assert.equal(readings[1]!.value, 25);
  assert.equal(readings[1]!.time, 0.033);
  assert.deepEqual(setupReadings(faceOnModel(undefined)), []);
  assert.deepEqual(setupReadings(faceOnModel({ t: 0, grip: [0.52, 0.6], clubhead: [0.5, 0.88] })).map((row) => row.id), ["shaft_address"]);
});

test("setup marks must stay on the picture and apart", () => {
  const marks = { t: 1.2, grip: [0.4, 0.5], clubhead: [0.5, 0.8] };
  assert.ok(setupMarksSchema.safeParse(marks).success);
  assert.ok(!setupMarksSchema.safeParse({ ...marks, grip: [1.2, 0.5] }).success);
  assert.ok(!setupMarksSchema.safeParse({ ...marks, ball: [0.5, -0.1] }).success);
  assert.ok(!setupMarksSchema.safeParse({ ...marks, clubhead: [0.4, 0.505] }).success);
  // Stored marks survive the compact round trip; damaged ones are dropped.
  const model = { ...faceOnModel({ t: 0, grip: [0.4, 0.5], clubhead: [0.5, 0.8] }) };
  assert.deepEqual(expandMotionModel(compactMotionModel(model))!.setup, model.setup);
  const damaged = { ...compactMotionModel(model), setup: { t: 0, grip: [2, 0.5] } } as unknown as PoseModel;
  assert.equal(expandMotionModel(damaged)!.setup, undefined);
});

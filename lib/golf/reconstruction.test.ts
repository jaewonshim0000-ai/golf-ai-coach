import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferBallSide, positionTime, reconstructionTrack, reconstructSwing, samplePosition } from "./reconstruction";
import { compactMotionModel, expandMotionModel } from "./motion-storage";
import { packFrames, type Landmark, type PoseModel } from "./pose";
import { ASPECT, DOWN_THE_LINE, FACE_ON, PHASES, film } from "./swing.fixture";

describe("3D swing reconstruction", () => {
  it("retains inferred depth, moves with the observed body and keeps limbs rigid in both camera views", () => {
    for (const [camera, view] of [[FACE_ON, "face_on"], [DOWN_THE_LINE, "down_the_line"]] as const) {
      const detected = film(camera, 17).detected;
      const original = structuredClone(detected);
      const rebuilt = reconstructSwing(detected, ASPECT, view)!;
      assert.ok(rebuilt);
      assert.equal(rebuilt.length, detected.length);
      assert.deepEqual(rebuilt.map((frame) => frame.t), detected.map((frame) => frame.t));
      for (const [a, b] of [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]]) {
        const lengths = rebuilt.map((frame) => {
          const from = frame.landmarks[a!]!, to = frame.landmarks[b!]!;
          return Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);
        });
        assert.ok(Math.max(...lengths) - Math.min(...lengths) < 1e-8);
      }
      assert.ok(rebuilt.every((frame) => frame.landmarks.length === 33 && frame.landmarks.every((point) => [point.x, point.y, point.z].every(Number.isFinite))));
      assert.ok(rebuilt.some((frame) => Math.abs(frame.landmarks[11]!.z - frame.landmarks[12]!.z) > 0.1));
      const hips = rebuilt.map((frame) => (frame.landmarks[23]!.x + frame.landmarks[24]!.x) / 2);
      assert.ok(Math.max(...hips) - Math.min(...hips) > 0.015, "the replay must not remain pinned to the hips");
      assert.deepEqual(detected, original);
    }
  });

  it("requires actual 3D detector coordinates and leg evidence rather than treating 2D as 3D", () => {
    const detected = film(FACE_ON, 17).detected;
    assert.equal(reconstructSwing(detected.map((frame) => ({ ...frame, landmarks: [] })), ASPECT, "face_on"), null);
    assert.equal(reconstructSwing(detected.map(({ t, landmarks }) => ({ t, landmarks })), ASPECT, "face_on"), null);
    const corrupt = structuredClone(detected); corrupt[0]!.landmarks[11]!.z = NaN;
    assert.equal(reconstructSwing(corrupt, ASPECT, "face_on"), null);
    assert.equal(reconstructSwing(detected, NaN, "face_on"), null);
    for (const frame of detected) for (const joint of [23, 24, 25, 26, 27, 28]) frame.imageLandmarks![joint]!.visibility = 0;
    assert.equal(reconstructSwing(detected, ASPECT, "face_on"), null);
  });

  it("saves and reloads a floor-centred 3D replay without flattening depth or changing timestamps", () => {
    const rebuilt = reconstructSwing(film(DOWN_THE_LINE, 4).detected.slice(0, 128), ASPECT, "down_the_line")!;
    rebuilt[10]!.imageLandmarks![15]!.visibility = 0.1;
    const model: PoseModel = { v: 1, ...packFrames(rebuilt), phases: PHASES, handedness: "right", aspect: ASPECT,
      cameraAngle: "down_the_line", motionVersion: 1, reconstructionVersion: 1, reconstructionEngine: "mediapipe-ghum-heavy" };
    const stored = compactMotionModel(model);
    assert.ok(JSON.stringify(stored).length < 250000);
    assert.equal(stored.frames.length, 0);
    assert.ok(stored.worldData);
    const restored = expandMotionModel(stored)!;
    assert.ok(restored);
    assert.deepEqual(restored.t, model.t);
    for (const [index, frame] of restored.frames.entries()) for (const [joint, point] of frame.entries()) {
      for (const axis of [0, 1, 2]) assert.ok(Math.abs(point[axis]! - model.frames[index]![joint]![axis]!) < 1e-12);
    }
    const track = reconstructionTrack(restored)!;
    assert.ok(track);
    assert.equal(track[10]![15]!.visibility, 0.1);
    assert.ok(track[PHASES.address]![0]!.y > 1);
    assert.ok(track[PHASES.address]!.slice(27).every((point) => point.y >= -1e-8));
    assert.equal(reconstructionTrack({ ...restored, reconstructionVersion: undefined }), null);
    assert.equal(expandMotionModel({ ...stored, worldData: "[[[1,2,3]]]" }), null);
    assert.equal(expandMotionModel({ ...stored, worldData: undefined }), null);
  });

  it("plays unevenly sampled frames at their real video times", () => {
    const times = [11.1, 11.6, 11.625, 11.65, 12.1];
    assert.ok(Math.abs(samplePosition(times, 11.6125) - 1.5) < 1e-10);
    assert.equal(positionTime(times, 1.5), 11.6125);
    assert.equal(samplePosition(times, 10), 0);
    assert.equal(samplePosition(times, 13), 4);
    for (const position of [0, 0.25, 1, 1.5, 2.75, 3, 4]) assert.ok(Math.abs(samplePosition(times, positionTime(times, position)) - position) < 1e-8);
  });

  it("infers ball side from visible setup, including mirrored recordings, without guessing a hidden grip", () => {
    const frames = film(DOWN_THE_LINE, 9).detected;
    const side = inferBallSide(frames, ASPECT);
    assert.ok(side);
    const mirrored = frames.map((frame) => ({ ...frame, imageLandmarks: frame.imageLandmarks!.map((point): Landmark => ({ ...point, x: 1 - point.x })) }));
    assert.equal(inferBallSide(mirrored, ASPECT), side === "left" ? "right" : "left");
    for (const frame of frames) for (const joint of [15, 16]) frame.imageLandmarks![joint]!.visibility = 0;
    assert.equal(inferBallSide(frames, ASPECT), undefined);
  });
});

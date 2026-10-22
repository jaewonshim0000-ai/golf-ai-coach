import assert from "node:assert/strict";
import { it } from "node:test";
import { faceOnSwing } from "../golf/__fixtures__/face-on";
import { buildVideoModel } from "../golf/video-review";
import { reviewSwing } from "./review";
import { swingCandidates } from "./segments";
import { SWING_ENGINE } from "./policy";
import type { CaptureManifest } from "./contracts";
import { compactMotionModel, expandMotionModel } from "../golf/motion-storage";

export function manifest(): CaptureManifest {
  return { engine: SWING_ENGINE, measurementModel: "mediapipe-heavy-f16-v1", scoutModel: "none", timestampSource: "decoded",
    width: 720, height: 1280, maxInputEdge: 960, inferences: 61, seeks: 61, duplicates: 0, rejectedPoses: 0, elapsedMs: 1000 };
}
const options = { aspect: 9 / 16, view: "face_on" as const, handedness: "right" as const };

it("uses one review contract after storage and exposes the evidence behind each check", () => {
  const model = buildVideoModel(faceOnSwing(), { ...options, capture: manifest() });
  const review = reviewSwing(model);
  assert.equal(review.blocks.length, 0);
  assert.ok(review.report.tempo);
  assert.equal(review.focus.status, "clear");
  assert.deepEqual(review.evidence.map((item) => item.id), ["head", "height", "tempo"]);
  assert.ok(review.evidence.every((item) => item.state === "supported" && item.reason && item.sampleTimes.length));
  assert.deepEqual(reviewSwing(expandMotionModel(compactMotionModel(model))!), review);
  assert.ok(Buffer.byteLength(JSON.stringify(compactMotionModel(model))) < 262144);
});

it("withholds rhythm without decoded timestamps while preserving body evidence", () => {
  for (const capture of [undefined, { ...manifest(), timestampSource: "seek" as const }]) {
    const review = reviewSwing(buildVideoModel(faceOnSwing(), { ...options, capture }));
    assert.equal(review.report.tempo, null);
    assert.equal(review.evidence.find((item) => item.id === "tempo")?.state, "unavailable");
    assert.equal(review.evidence.find((item) => item.id === "head")?.state, "supported");
    assert.equal(review.focus.status, "clear");
  }
});

it("withholds corrections for incompatible provenance and corrupt frame arrays", () => {
  const model = buildVideoModel(faceOnSwing(), { ...options, capture: manifest() });
  model.capture!.inferences = 1;
  assert.equal(reviewSwing(model).focus.status, "needs_input");
  model.imageFrames![3] = null as never;
  assert.doesNotThrow(() => reviewSwing(model));
  assert.equal(reviewSwing(model).report.usable, false);
  assert.equal(reviewSwing(model).focus.status, "needs_input");
});

it("requests a trim for two complete swings and never picks a fault from the first", () => {
  const first = faceOnSwing(), second = faceOnSwing().map((f) => ({ ...f, t: f.t + 3 }));
  const frames = [...first, ...second];
  assert.equal(swingCandidates(frames, 1, "face_on").length, 2);
  const model = buildVideoModel(frames, { ...options, aspect: 1 });
  const review = reviewSwing(model);
  assert.match(review.focus.issue, /More than one/);
  assert.equal(review.focus.id, null);
});

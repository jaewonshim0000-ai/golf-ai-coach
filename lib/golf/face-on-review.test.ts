import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareFaceOn, reviewFaceOn } from "./face-on-review";
import { packFrames, unpackFrames, type PoseModel } from "./pose";
import { faceOnSwing } from "./__fixtures__/face-on";
import { compactMotionModel, expandMotionModel } from "./motion-storage";


describe("automatic face-on review", () => {
  it("uses observed image movement without a score or inferred depth", () => {
    const frames = faceOnSwing(), before = structuredClone(frames);
    const review = reviewFaceOn(frames, 9 / 16);
    assert.equal(review.status, "ready");
    assert.equal(review.scope, "backswing");
    assert.equal(review.metrics.find((m) => m.id === "hips")?.value, 10);
    assert.equal(review.metrics.find((m) => m.id === "head")?.value, 0);
    assert.equal(review.metrics.length, 3);
    assert.equal("score" in review, false);
    assert.deepEqual(frames, before);
    assert.deepEqual(reviewFaceOn(frames.map((f) => ({ ...f, landmarks: [] })), 9 / 16), review);
  });
  it("still reviews visible body movement without complete swing timing", () => {
    const frames = faceOnSwing().slice(0, 42);
    const review = reviewFaceOn(frames, 9 / 16);
    assert.equal(review.status, "partial");
    assert.equal(review.scope, "visible_segment");
    assert.equal(review.metrics.length, 3);
    assert.ok(review.notes.some((note) => note.includes("without an impact estimate")));
    assert.ok(review.metrics.every((m) => m.evidence.includes("tracked video segment")));
  });
  it("rejects wrong views, profile projections and a moving camera", () => {
    assert.equal(reviewFaceOn(faceOnSwing(), 1, "down_the_line").status, "record_again");
    const profile = faceOnSwing();
    for (const f of profile) for (const j of [11, 12, 23, 24, 27, 28]) f.imageLandmarks![j]!.x = 0.5 + j * 0.0001;
    assert.equal(reviewFaceOn(profile, 1).status, "record_again");
    const pan = faceOnSwing();
    for (const f of pan) for (const p of f.imageLandmarks!) p.x += f.t > 0.4 ? 0.08 : 0;
    const review = reviewFaceOn(pan, 1);
    assert.equal(review.status, "record_again");
    assert.equal(review.metrics.length, 0);
  });
  it("does not guess setup for an incomplete start or a static person", () => {
    assert.equal(reviewFaceOn(faceOnSwing().slice(15), 1).status, "record_again");
    const still = faceOnSwing();
    for (const f of still) for (const j of [15, 16]) f.imageLandmarks![j]!.y = 0.66;
    assert.equal(reviewFaceOn(still, 1).status, "record_again");
  });
  it("omits a hidden nose without discarding supported hips", () => {
    const frames = faceOnSwing();
    for (const f of frames.slice(10)) f.imageLandmarks![0]!.visibility = 0.1;
    const review = reviewFaceOn(frames, 1);
    assert.equal(review.status, "partial");
    assert.equal(review.metrics.some((m) => m.id === "head"), false);
    assert.equal(review.metrics.some((m) => m.id === "hips"), true);
  });
  it("does not mistake normal knee flexion for camera movement", () => {
    const frames = faceOnSwing();
    for (const frame of frames) for (const joint of [25, 26]) {
      frame.imageLandmarks![joint]!.y -= Math.sin(frame.t / 2.4 * Math.PI) * 0.12;
    }
    const review = reviewFaceOn(frames, 9 / 16);
    assert.equal(review.status, "ready");
    assert.equal(review.metrics.length, 3);
    assert.equal(review.metrics.find((metric) => metric.id === "hips")?.value, 10);
  });
  it("does not report an isolated plausible tracking error as peak movement", () => {
    const frames = faceOnSwing();
    frames[15]!.imageLandmarks![0]!.x += 0.08;
    const review = reviewFaceOn(frames, 1);
    assert.equal(review.metrics.find((m) => m.id === "head")?.value, 0);
    assert.ok(review.metrics.find((m) => m.id === "head")?.evidence.includes("under 1%"));
  });
  it("rejects timing gaps and invalid input rather than claiming continuous tracking", () => {
    const sparse = faceOnSwing().filter((_, n) => n < 7 || n > 18);
    assert.equal(reviewFaceOn(sparse, 1).status, "record_again");
    const unordered = faceOnSwing(); unordered[8]!.t = unordered[7]!.t;
    assert.equal(reviewFaceOn(unordered, 1).status, "record_again");
    assert.equal(reviewFaceOn(faceOnSwing(), NaN).status, "record_again");
  });
  it("keeps the review through compact image-only storage", () => {
    const frames = faceOnSwing(), packed = packFrames(frames);
    const model: PoseModel = { v: 1, handedness: "right", phases: { address: 0, top: 36, impact: 44 },
      ...packed, frames: [], aspect: 9 / 16, motionVersion: 1, cameraAngle: "face_on" };
    const stored = compactMotionModel(model);
    assert.equal(stored.worldData, undefined);
    assert.equal(stored.frames.length, 0);
    const expanded = expandMotionModel(stored)!;
    assert.deepEqual(reviewFaceOn(unpackFrames(expanded), 9 / 16), reviewFaceOn(unpackFrames(packed), 9 / 16));
  });
  it("compares only equivalent windows and similar camera setups", () => {
    const review = reviewFaceOn(faceOnSwing(), 9 / 16);
    assert.ok(compareFaceOn(review, review));
    assert.equal(compareFaceOn(review, reviewFaceOn(faceOnSwing().slice(0, 42), 9 / 16)), null);
    assert.equal(compareFaceOn(review, reviewFaceOn(faceOnSwing(), 1)), null);
    assert.equal(compareFaceOn(review, { ...review, setup: { ...review.setup!, stanceToBody: 0.1 } }), null);
  });
});

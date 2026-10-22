import assert from "node:assert/strict";
import { it } from "node:test";
import { packFrames } from "../golf/pose";
import { faceOnSwing } from "../golf/__fixtures__/face-on";
import { evaluateSwingCaptures } from "./evaluation";

function capture() {
  const packed = packFrames(faceOnSwing());
  return { id: "synthetic", origin: "synthetic", split: "development", view: "face_on", handedness: "right",
    sourceFps: 25, occluded: false, shouldAbstain: false, acceptableIssues: [],
    phases: { address: 0.24, top: 1.44, impact: 1.76 },
    tracks: { swing_session_id: "evaluation", t: packed.t, frames: packed.imageFrames, imageFrames: packed.imageFrames, aspect: 9 / 16 },
  };
}
it("synthetic and development fixtures cannot satisfy the real-video release gate", () => {
  const c = capture();
  const result = evaluateSwingCaptures([c]);
  assert.equal(result.gate, "blocked");
  assert.equal(result.metrics.count, 0);
  assert.equal(result.rows.length, 1);
  assert.ok(result.reasons.some((reason) => reason.includes("independent recorded holdout")));
  assert.ok(result.reasons.some((reason) => reason.includes("unmeasured")));
});
it("rejects duplicate IDs, missing annotation provenance and holdout leakage", () => {
  const c = capture();
  assert.throws(() => evaluateSwingCaptures([c, c]), /unique id/);
  assert.throws(() => evaluateSwingCaptures([{ ...c, origin: "recorded" }]), /independent annotator/);
  const recorded = { ...c, origin: "recorded", recordingId: "video-1", golferId: "golfer-1", annotatorId: "coach-1", consented: true };
  assert.throws(() => evaluateSwingCaptures([recorded, { ...recorded, id: "holdout", split: "holdout" }]), /development and holdout/);
});
it("counts incorrect corrections and missing detections instead of discarding them", () => {
  const c = capture();
  const wrong = structuredClone(c);
  for (const row of wrong.tracks.imageFrames!.slice(40)) row[0]![0] = 0.72;
  const make = (data: typeof c, id: string) => ({ ...data, id, origin: "recorded", split: "holdout",
    recordingId: id, golferId: id, annotatorId: "coach-1", consented: true });
  const result = evaluateSwingCaptures([make(wrong, "wrong-correction"), make({ ...c, acceptableIssues: ["head"] as never }, "missed-issue")]);
  assert.equal(result.metrics.count, 2);
  assert.equal(result.metrics.falseCorrectionRate, 1);
  assert.equal(result.rows[1]!.missedIssue, true);
  assert.equal(result.gate, "blocked");
});

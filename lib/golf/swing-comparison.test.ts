import assert from "node:assert/strict";
import { it } from "node:test";
import { faceOnSwing } from "./__fixtures__/face-on";
import { analyseVideoModel, buildVideoModel } from "./video-review";
import { getSwingFocus } from "./swing-focus";
import { compareSwingToReference, comparisonAnchors, comparisonProgress, comparisonTime, matchSwingReferences } from "./swing-comparison";
import { currentSwingModel, readSwingReference, swingReferenceSchema, type SwingReference } from "./swing-reference";
import type { PoseModel } from "./pose";
import type { SwingSession } from "../../types/practice";

const metadata = { name: "Test coach", kind: "coach" as const, handedness: "right" as const, source: "Test fixture only", permission: true as const };
function model(shift = 0): PoseModel {
  const frames = faceOnSwing();
  for (const frame of frames) if (frame.t > 1.5) frame.imageLandmarks![0]!.x += shift;
  return buildVideoModel(frames, { aspect: 1, view: "face_on", handedness: "right" });
}
function reference(recording = model(), id = "reference"): SwingReference {
  const session: SwingSession = { id, user_id: "player", club: "7_iron", camera_angle: "face_on", video_url: "local://clip/test",
    shot_type: "full swing", swing_pattern: "unknown", notes: null, analysis_status: "processed", clip_start: null, clip_end: null, created_at: "2026-10-18T00:00:00Z" };
  return { session, model: { ...recording, reference: metadata }, metadata };
}

it("aligns exact swing positions and preserves monotonic time through different phase lengths", () => {
  const anchors: [number, number, number, number] = [0.2, 1.1, 1.4, 2.2];
  anchors.forEach((time, index) => { assert.equal(comparisonTime(anchors, index), time); assert.equal(comparisonProgress(anchors, time), index); });
  let last = -Infinity;
  for (let progress = 0; progress < 3; progress += 0.03) {
    const time = comparisonTime(anchors, progress);
    assert.ok(time >= last); last = time;
    assert.ok(Math.abs(comparisonProgress(anchors, time) - progress) < 1e-9);
  }
  assert.equal(comparisonTime(anchors, -2), anchors[0]);
  assert.equal(comparisonTime(anchors, 9), anchors[3]);
  assert.equal(comparisonTime(anchors, NaN), anchors[0]);
});

it("compares actual reference tracks and produces one supported issue with its procedure", () => {
  const comparison = compareSwingToReference(model(0.22), "7_iron", reference());
  assert.equal(comparison.status, "ready");
  assert.equal(comparison.focus?.id, "head");
  assert.match(comparison.focus!.issue, /Compared with Test coach/);
  assert.equal(comparison.focus!.steps.length, 3);
  assert.match(comparison.focus!.steps.join(" "), /sideways/);
  assert.ok(comparison.differences.find((row) => row.id === "head")!.excess > 8);
});

it("normalizes body scale and position instead of comparing raw pixels", () => {
  const frames = faceOnSwing();
  for (const frame of frames) for (const point of frame.imageLandmarks!) {
    point.x = 0.15 + point.x * 0.7; point.y = 0.1 + point.y * 0.7;
  }
  const smaller = buildVideoModel(frames, { aspect: 1, view: "face_on", handedness: "right" });
  const comparison = compareSwingToReference(smaller, "7_iron", reference());
  assert.equal(comparison.status, "ready");
  assert.equal(comparison.focus?.status, "clear");
  assert.ok(comparison.differences.every((row) => Math.abs(row.excess) <= 0.1));
});

it("does not call every difference from a coach a mistake or erase an uncomparable issue", () => {
  const same = compareSwingToReference(model(), "7_iron", reference());
  assert.equal(same.focus?.status, "clear");
  assert.equal(same.focus?.id, null);
  const ref = reference();
  for (const [index, frame] of ref.model.imageFrames!.entries()) if (Math.abs(ref.model.t[index]! - 1.76) < 0.08) frame[0]![3] = 0.1;
  const compared = compareSwingToReference(model(0.22), "7_iron", ref);
  assert.equal(compared.differences.some((row) => row.id === "head"), false);
  assert.equal(compared.focus, null);
  const fallback = compared.focus ?? getSwingFocus(analyseVideoModel(model(0.22)));
  assert.equal(fallback.id, "head");
  assert.doesNotMatch(fallback.issue, /Compared with/);
});

it("rejects mismatched clubs, views and stale reference trims", () => {
  assert.equal(compareSwingToReference(model(), "driver", reference()).status, "incompatible");
  const behind = reference({ ...model(), cameraAngle: "down_the_line" });
  assert.equal(compareSwingToReference(model(), "7_iron", behind).status, "incompatible");
  const ref = reference({ ...model(), clip: [0, 2.4] });
  ref.session.clip_start = 0.5;
  assert.equal(currentSwingModel(ref.model, ref.session), false);
  assert.equal(readSwingReference(ref.session, ref.model), null);
  const incomplete = model(); incomplete.imageFrames = [];
  assert.equal(comparisonAnchors(incomplete), null);
  assert.equal(compareSwingToReference(incomplete, "7_iron", reference()).status, "limited");
});

it("matches available reference clips and mirrors only replay orientation", () => {
  const normal = reference(), wrongClub = reference(model(), "wrong-club"), wrongView = reference({ ...model(), cameraAngle: "other" }, "wrong-view");
  wrongClub.session.club = "driver";
  assert.deepEqual(matchSwingReferences(model(), "7_iron", [wrongClub, normal, wrongView]).map((row) => row.session.id), ["reference"]);
  const mirrored = reference(model(), "mirrored");
  for (const frame of mirrored.model.imageFrames!) for (const point of frame) point[0] = 1 - point[0];
  const compared = compareSwingToReference(model(), "7_iron", mirrored);
  assert.equal(compared.status, "ready"); assert.equal(compared.mirrorReference, true);
  assert.equal(compared.focus?.status, "clear");
});

it("stores explicit reference attribution and rejects invented metadata or unconfirmed reuse rights", () => {
  assert.equal(swingReferenceSchema.safeParse(metadata).success, true);
  for (const invalid of [{ ...metadata, permission: false }, { ...metadata, name: "" }, { ...metadata, kind: "tour_verified" }, { ...metadata, similarity: 100 }]) {
    assert.equal(swingReferenceSchema.safeParse(invalid).success, false);
  }
  const ref = reference();
  assert.equal(readSwingReference(ref.session, ref.model)?.metadata.name, "Test coach");
});

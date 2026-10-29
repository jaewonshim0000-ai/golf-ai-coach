import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreReconstruction } from "./reconstruction-score";
import type { PackedLandmark, PoseModel } from "./pose";
import type { MotionReport, MotionView } from "./motion-analysis";

function fixture(view: MotionView = "face_on") {
  const t = Array.from({ length: 32 }, (_, index) => index * 0.025);
  const model: PoseModel = { v: 1, motionVersion: 1, reconstructionVersion: 1, handedness: "right", cameraAngle: view, aspect: 1, ballSide: "right",
    phases: { address: 0, top: 20, impact: 30 }, t,
    frames: t.map((_, index) => {
      const points: PackedLandmark[] = Array.from({ length: 33 }, () => [0, 0, 0, 0.95]);
      const angle = (index >= 28 ? 5 : 40) * Math.PI / 180;
      points[23] = [-0.1, 0, 0, 0.95]; points[24] = [0.1, 0, 0, 0.95];
      points[11] = [-0.2, -0.5 * Math.cos(angle), 0.5 * Math.sin(angle), 0.95];
      points[12] = [0.2, -0.5 * Math.cos(angle), 0.5 * Math.sin(angle), 0.95];
      return points;
    }),
    imageFrames: t.map(() => Array.from({ length: 33 }, (): PackedLandmark => [0.5, 0.5, 0, 0.95])),
  };
  const report: MotionReport = { view, usable: true, phases: model.phases, timing: { source: "hands", uncertainty: 0.025 },
    quality: { visible: 32, total: 32, coverage: 1, cameraStable: true, largestGap: 0.025 }, warnings: [], observations: [], summary: "Tracked",
    tempo: { backswing: 0.5, downswing: 0.25, ratio: 2, uncertainty: 0.025 },
    readings: [{ id: "head_impact", value: 8, unit: "% stance", label: "Head", phase: "impact", time: 0.75, note: "Observed" },
      { id: "hips_impact", value: 2, unit: "% body height", label: "Hips", phase: "impact", time: 0.75, note: "Observed" },
      { id: "torso_top", value: 35, unit: "° in picture", label: "Torso", phase: "top", time: 0.5, note: "Observed" }],
  };
  return { model, report };
}

describe("reconstructed swing score", () => {
  it("withholds posture when the reconstructed torso is uncertain despite clear image tracking", () => {
    const { model, report } = fixture();
    model.frames[report.phases!.impact]![12]![3] = 0.5;
    const score = scoreReconstruction(model, report);
    assert.equal(score.components.some((component) => component.id === "posture_3d"), false);
    assert.equal(score.total, null);
    assert.match(score.missing[0]!, /posture/);
  });
  it("scores actual reconstructed depth rather than substituting a face-on projected angle", () => {
    const { model, report } = fixture();
    const score = scoreReconstruction(model, report);
    assert.equal(score.total, 60);
    assert.equal(score.components.find((component) => component.id === "posture_3d")!.value, 35);
    assert.equal(score.priorities[0]!.id, "posture_3d");
    assert.ok(score.priorities[0]!.cue && score.priorities[0]!.check);
    assert.deepEqual(score.components.map((component) => component.weight), [40, 30, 30]);
    assert.equal(scoreReconstruction(fixture("down_the_line").model, fixture("down_the_line").report).total, 60);
  });

  it("keeps the posture score unchanged when the same 3D motion rotates around the camera's vertical axis", () => {
    const { model, report } = fixture();
    const expected = scoreReconstruction(model, report).total;
    for (const angle of [0.5, 1, 1.5, 2.5]) {
      const rotated = { ...model, frames: model.frames.map((frame) => frame.map(([x, y, z, visibility]): PackedLandmark => [
        x * Math.cos(angle) - z * Math.sin(angle), y, x * Math.sin(angle) + z * Math.cos(angle), visibility,
      ])) };
      assert.equal(scoreReconstruction(rotated, report).total, expected);
    }
  });

  it("labels partial scores and withholds unsupported displacement, hidden posture and old 2D-only models", () => {
    const { model, report } = fixture();
    report.tempo = null;
    assert.equal(scoreReconstruction(model, report).total, 43);
    assert.equal(scoreReconstruction(model, report).missing.length, 1);
    report.quality.cameraStable = false;
    assert.equal(scoreReconstruction(model, report).total, null);
    assert.equal(scoreReconstruction(model, report).components.some((component) => component.id === "head"), false);
    report.tempo = { backswing: 0.5, downswing: 0.25, ratio: 2, uncertainty: 0.025 };
    assert.equal(scoreReconstruction(model, report).total, 43); // relative posture + rhythm remain available
    assert.equal(scoreReconstruction({ ...model, reconstructionVersion: undefined }, report).total, null);
    report.quality.coverage = 0.8;
    assert.equal(scoreReconstruction(model, report).total, null);
  });

  it("shows an observed posture range and recommends a review when it spans scoring bands", () => {
    const { model, report } = fixture();
    for (const index of [29, 31]) for (const joint of [11, 12]) {
      model.frames[index]![joint]![1] = -0.5 * Math.cos(35 * Math.PI / 180);
      model.frames[index]![joint]![2] = 0.5 * Math.sin(35 * Math.PI / 180);
    }
    const score = scoreReconstruction(model, report);
    assert.deepEqual(score.totalRange, [60, 100]);
    assert.equal(score.priorities.some((component) => component.id === "posture_3d"), false);
    assert.equal(score.reviews[0]!.id, "posture_3d");
  });

  it("keeps supported posture and body control when a sampling gap excludes rhythm", () => {
    for (const view of ["face_on", "down_the_line"] as const) {
      const { model, report } = fixture(view);
      report.quality.largestGap = 0.16;
      report.tempo = null;
      const score = scoreReconstruction(model, report);
      assert.equal(score.total, 43);
      assert.deepEqual(score.components.map((component) => component.id), ["posture_3d", view === "face_on" ? "head" : "hip_depth"]);
      assert.equal(score.missing.length, 1);
      report.quality.cameraStable = false;
      assert.equal(scoreReconstruction(model, report).total, null);
      assert.deepEqual(scoreReconstruction(model, report).components.map((component) => component.id), ["posture_3d"]);
    }
  });

  it("explains unresolved timing on an existing reconstruction without asking for manual marks", () => {
    const { model, report } = fixture();
    const unresolved = { ...report, usable: false, phases: null };
    const score = scoreReconstruction(model, unresolved);
    assert.equal(score.total, null);
    assert.match(score.reason!, /automatic swing timing/);
    assert.match(score.reason!, /Record again in slow motion/);
    assert.doesNotMatch(score.reason!, /Build a 3D model/);
    assert.equal(scoreReconstruction(model, report).total, 60);
  });
});

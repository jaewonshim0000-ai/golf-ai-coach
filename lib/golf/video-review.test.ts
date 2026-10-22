import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { faceOnSwing } from "./__fixtures__/face-on";
import { analyseVideoModel, buildVideoModel } from "./video-review";
import { compactMotionModel, expandMotionModel } from "./motion-storage";
import { getSwingFocus } from "./swing-focus";

const options = { aspect: 9 / 16, view: "face_on" as const, handedness: "right" as const, clip: [0, 2.4] as [number, number] };

describe("saved 2D video review", () => {
  it("stores real detected phase indices and image-only measurements through reload", () => {
    const model = buildVideoModel(faceOnSwing(), options);
    assert.equal(model.timingStatus, "estimated");
    assert.equal(model.phasesConfirmed, false);
    assert.equal(model.frames.length, 0);
    assert.equal(model.phases.top, 36);
    const report = analyseVideoModel(model);
    assert.equal(report.usable, true);
    assert.deepEqual(analyseVideoModel(expandMotionModel(compactMotionModel(model))!), report);
  });

  it("keeps angle readings and saved tracks when camera movement prevents displacement readings", () => {
    const frames = faceOnSwing();
    for (const frame of frames) for (const point of frame.imageLandmarks!) point.x += frame.t > 0.4 ? 0.08 : 0;
    const model = buildVideoModel(frames, options);
    const report = analyseVideoModel(model);
    assert.equal(model.imageFrames?.length, frames.length);
    assert.equal(report.usable, true);
    assert.equal(report.quality.cameraStable, false);
    assert.ok(report.readings.length > 0);
    assert.ok(report.readings.every((reading) => reading.unit === "° in picture"));
  });

  it("supports down-the-line recordings without replacing their camera view", () => {
    const frames = faceOnSwing();
    for (const frame of frames) for (const joint of [12, 24, 28]) frame.imageLandmarks![joint]!.visibility = 0.1;
    const model = buildVideoModel(frames, { ...options, view: "down_the_line" });
    const report = analyseVideoModel(model);
    assert.equal(model.cameraAngle, "down_the_line");
    assert.equal(report.usable, true);
    assert.ok(report.readings.some((reading) => reading.id === "torso_top"));
    assert.equal(report.readings.some((reading) => reading.id.startsWith("shoulders_")), false);
  });

  it("preserves the supplied ball side across compact storage for down-the-line checks", () => {
    const model = buildVideoModel(faceOnSwing(), { ...options, view: "down_the_line", ballSide: "left" });
    assert.equal(expandMotionModel(compactMotionModel(model))?.ballSide, "left");
  });

  it("preserves manual timing corrections on subsequent analysis and reload", () => {
    const phases = { address: 5, top: 35, impact: 43 };
    const model = buildVideoModel(faceOnSwing(), { ...options, phases });
    assert.equal(model.phasesConfirmed, true);
    assert.equal(model.timingStatus, "confirmed");
    assert.deepEqual(analyseVideoModel(model).phases, phases);
    assert.equal(analyseVideoModel(model).timing?.source, "marked");
    assert.deepEqual(analyseVideoModel(expandMotionModel(compactMotionModel(model))!).phases, phases);
  });

  it("saves incomplete tracking without presenting placeholder positions as a measured swing", () => {
    const model = buildVideoModel(faceOnSwing().slice(0, 30), options);
    const report = analyseVideoModel(model);
    assert.equal(model.timingStatus, "unresolved");
    assert.equal(report.phases, null);
    assert.equal(report.usable, false);
    assert.equal(report.readings.length, 0);
    assert.equal(model.imageFrames?.length, 30);
  });

  it("recomputes contact and rhythm uncertainty from saved image tracks and preserves a timing correction", () => {
    const frames = faceOnSwing();
    for (const frame of frames.slice(43)) frame.imageLandmarks![0]!.x = Math.min(0.65, 0.56 + (frame.t - 1.72) * 0.75);
    const model = buildVideoModel(frames, { ...options, aspect: 1 });
    const restored = expandMotionModel(compactMotionModel(model))!;
    const report = analyseVideoModel(restored);
    assert.deepEqual(report.timing?.impactWindow, [43, 45]);
    assert.deepEqual(report.readings.find((row) => row.id === "head_impact")?.range, [12.5, 25]);
    assert.ok(report.tempo?.ratioRange);
    assert.equal(getSwingFocus(report).status, "needs_input");
    restored.phasesConfirmed = true;
    restored.timingStatus = "confirmed";
    const confirmed = analyseVideoModel(expandMotionModel(compactMotionModel(restored))!);
    assert.equal(confirmed.timing?.impactWindow, undefined);
    assert.equal(getSwingFocus(confirmed).id, "head");
  });
});

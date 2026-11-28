import "../golf/test-rubric";
import assert from "node:assert/strict";
import { it } from "node:test";
import { faceOnSwing } from "../golf/__fixtures__/face-on";
import { buildVideoModel } from "../golf/video-review";
import { scoreSwing } from "../golf/swing-score";
import { golfPoseProResult } from "../golfposepro/result";
import { ironPoses } from "../golfposepro/__fixtures__/poses";
import { DRILLS_BY_ID } from "../seed/drills";
import { reviewSwing } from "./review";
import { scoreTrend, swingResult } from "./result";

const options = { aspect: 9 / 16, view: "face_on" as const, handedness: "right" as const };
const golfPosePro = golfPoseProResult(ironPoses(), 30, 720, 1280)!.result;

it("scores the swing checks, keeping rhythm for GolfPosePro tracks, and gives drills even for a clean swing", () => {
  const model = { ...buildVideoModel(faceOnSwing(), options), golfPosePro };
  const { report } = reviewSwing(model);
  assert.equal(report.tempo?.ratio, 3.4);
  const result = swingResult(model);
  assert.equal(result.score, scoreSwing(report).total! / 10);
  assert.ok(result.score! >= 8.5 && result.score! <= 10);
  assert.equal(result.reason, null);
  assert.equal(result.checks.length, 3);
  assert.deepEqual(result.weaknesses, []);
  assert.equal(result.drills.length, 3);
});

it("names the weakest check in plain words and picks its library drills", () => {
  const frames = faceOnSwing().map((frame) => {
    // The head drifts toward the target from the top through the finish.
    const points = frame.imageLandmarks!.map((point) => ({ ...point }));
    points[0] = { ...points[0]!, x: 0.5 + Math.max(0, frame.t - 1.44) * 0.4 };
    return { ...frame, imageLandmarks: points };
  });
  const result = swingResult({ ...buildVideoModel(frames, options), golfPosePro });
  assert.ok(result.score !== null && result.score < 8.5);
  assert.equal(result.weaknesses[0]?.id, "head");
  assert.equal(result.weaknesses[0]?.issue, "Your head shifts sideways through contact.");
  assert.match(result.weaknesses[0]!.evidence, /stance width/);
  assert.equal(result.drills[0]?.id, "drill_half_swing_contact");
  assert.ok(result.drills.length >= 1 && result.drills.length <= 3);
  assert.ok(result.drills.every((drill) => DRILLS_BY_ID.get(drill.id) === drill));
});

it("scores a swing whose own timing fails, using GolfPosePro's key frames", () => {
  // Hidden hands defeat the automatic swing timing; the body is still visible.
  const frames = faceOnSwing().map((frame) => ({ ...frame, imageLandmarks: frame.imageLandmarks!.map((point, i) => i >= 15 && i <= 22 ? { ...point, visibility: 0 } : point) }));
  const model = buildVideoModel(frames, options);
  assert.equal(reviewSwing(model).report.phases, null);
  // The fixture's address, top and impact samples, as GolfPosePro frames at 25 fps.
  const keyFrames = (["Address", "Top", "Impact"] as const).map((phase, i) => ({ phase, frame: [9, 36, 44][i]!, pose: null }));
  const result = swingResult({ ...model, golfPosePro: { ...golfPosePro, fps: 25, startFrame: 0, keyFrames } });
  assert.ok(result.score !== null && result.score >= 8.5);
  assert.deepEqual(result.checks, ["Head control at impact", "Height control in the backswing"]); // no rhythm from GolfPosePro phases
});

it("gives no score or drills when the recording cannot be reviewed", () => {
  const model = { ...buildVideoModel(faceOnSwing(), options), golfPosePro };
  model.imageFrames![3] = null as never;
  const result = swingResult(model);
  assert.equal(result.score, null);
  assert.match(result.reason!, /Review again/);
  assert.deepEqual(result.drills, []);
});

it("averages the latest swings and compares them with as many before", () => {
  const points = (values: number[]) => values.map((value, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, value }));
  assert.deepEqual(scoreTrend([]), { recent: 1, average: null, change: null });
  assert.deepEqual(scoreTrend(points([6.2])), { recent: 1, average: 6.2, change: null });
  assert.deepEqual(scoreTrend(points([6, 7])), { recent: 1, average: 7, change: 1 });
  // Five against the five before; the oldest two fall outside both.
  assert.deepEqual(scoreTrend(points([1, 1, 5, 5, 5, 5, 5, 7, 7, 7, 7, 8])), { recent: 5, average: 7.2, change: 2.2 });
  assert.deepEqual(scoreTrend(points([8, 7, 6])), { recent: 1, average: 6, change: -1 });
});

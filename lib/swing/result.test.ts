import assert from "node:assert/strict";
import { it } from "node:test";
import { faceOnSwing } from "../golf/__fixtures__/face-on";
import { buildVideoModel } from "../golf/video-review";
import { scoreSwing } from "../golf/swing-score";
import { golfPoseProResult } from "../golfposepro/result";
import { ironPoses } from "../golfposepro/__fixtures__/poses";
import { DRILLS_BY_ID } from "../seed/drills";
import { reviewSwing } from "./review";
import { swingResult } from "./result";

const options = { aspect: 9 / 16, view: "face_on" as const, handedness: "right" as const };
const golfPosePro = golfPoseProResult(ironPoses(), 30, 720, 1280)!.result;

it("scores the swing checks, keeping rhythm for GolfPosePro tracks, and gives drills even for a clean swing", () => {
  const model = { ...buildVideoModel(faceOnSwing(), options), golfPosePro };
  const { report } = reviewSwing(model);
  assert.equal(report.tempo?.ratio, 3.4);
  const result = swingResult(model);
  assert.equal(result.score, scoreSwing(report).total);
  assert.ok(result.score! >= 85 && result.score! <= 100);
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
  assert.ok(result.score !== null && result.score < 85);
  assert.equal(result.weaknesses[0]?.id, "head");
  assert.equal(result.weaknesses[0]?.issue, "Your head shifts sideways through contact.");
  assert.match(result.weaknesses[0]!.evidence, /stance width/);
  assert.equal(result.drills[0]?.id, "drill_half_swing_contact");
  assert.ok(result.drills.length >= 1 && result.drills.length <= 3);
  assert.ok(result.drills.every((drill) => DRILLS_BY_ID.get(drill.id) === drill));
});

it("gives no score or drills when the recording cannot be reviewed", () => {
  const model = { ...buildVideoModel(faceOnSwing(), options), golfPosePro };
  model.imageFrames![3] = null as never;
  const result = swingResult(model);
  assert.equal(result.score, null);
  assert.match(result.reason!, /Review again/);
  assert.deepEqual(result.drills, []);
});

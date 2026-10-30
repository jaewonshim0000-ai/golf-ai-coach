import assert from "node:assert/strict";
import { it } from "node:test";
import { GPP_PHASES } from "./phases";
import { ironPoses, reference } from "./__fixtures__/poses";
import { frameTime, golfPoseProResult } from "./result";


it("keeps GolfPosePro's phases, key frames at phase middles, and a bounded overlay track", () => {
  const { result, track } = golfPoseProResult(ironPoses(), 30, 720, 1280, 6)!;
  assert.deepEqual(result.phases, reference.IMG_1022.phases);
  assert.equal(result.swingStart, reference.IMG_1022.swingStart);
  assert.equal(result.wristY.length, 564);
  assert.deepEqual(result.keyFrames.map((key) => key.phase), [...GPP_PHASES]);
  for (const key of result.keyFrames) {
    const [start, end] = result.phases[key.phase];
    assert.equal(key.frame, Math.floor((start + end) / 2));
    assert.equal(key.pose?.length, 33);
  }
  assert.ok(track.length >= 8 && track.length <= 96);
  // Video time, offset by the trim's first frame.
  assert.equal(frameTime(result, 0), 0.2);
  assert.ok(track.every((frame, n) => frame.t >= frameTime(result, result.swingStart - 15) && (!n || frame.t > track[n - 1]!.t)));
});

it("finds no swing where the notebook would raise", () => {
  assert.equal(golfPoseProResult(Array.from({ length: 60 }, () => null), 30, 720, 1280), null);
});

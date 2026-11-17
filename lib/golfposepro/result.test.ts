import assert from "node:assert/strict";
import { it } from "node:test";
import { GPP_PHASES } from "./phases";
import { ironPoses, reference } from "./__fixtures__/poses";
import { frameTime, followGolfer, golfPoseProResult } from "./result";


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

it("follows the golfer through frames where only a bystander is found, and starts at the golfer's first frame", () => {
  const person = (x: number, top: number, bottom: number) => Array.from({ length: 33 }, (_, joint) => ({ x, y: top + (bottom - top) * joint / 32, visibility: 0.9 }));
  const bystander = person(0.05, 0.27, 0.56), golfer = person(0.5, 0.28, 0.7), drifted = person(0.56, 0.28, 0.7);
  // The detector finds only the bystander at first, then both, then the picture pans a little.
  const followed = followGolfer([[bystander], [bystander, golfer], [golfer, bystander], [drifted], [bystander], []], 0.5625);
  assert.deepEqual(followed, [null, golfer, golfer, drifted, null, null]);
  assert.deepEqual(followGolfer([[], []], 0.5625), [null, null]);
  // Frames before the golfer is first seen are dropped, so one unseen frame cannot hide the swing.
  const poses = ironPoses();
  const late = golfPoseProResult([null, null, ...poses], 30, 720, 1280, 6)!;
  assert.equal(late.result.startFrame, 8);
  assert.deepEqual(late.result.phases, reference.IMG_1022.phases);
});

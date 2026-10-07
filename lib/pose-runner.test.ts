import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { refinementTimes, selectTrackedPose } from "./pose-runner";
import { findAutomaticTiming } from "./golf/motion-analysis";
import type { Landmark, PoseFrame } from "./golf/pose";

describe("choosing a tracked golfer", () => {
  const pose = (x: number, height = 0.5): Landmark[] => Array.from({ length: 33 }, (_, index) => ({ x, y: index === 27 ? 0.9 : index === 11 ? 0.9 - height : 0.6, z: 0, visibility: 0.95 }));
  it("keeps the same body when detector result order changes", () => {
    assert.equal(selectTrackedPose([pose(0.8, 0.7), pose(0.5)], pose(0.5)), 1);
    assert.equal(selectTrackedPose([pose(0.5), pose(0.8, 0.7)], pose(0.5)), 0);
    assert.equal(selectTrackedPose([pose(0.95)], pose(0.3)), -1);
  });
  it("accepts a visible profile while still rejecting a body hidden on both sides", () => {
    const profile = pose(0.5);
    for (const joint of [12, 24, 28]) profile[joint]!.visibility = 0.1;
    assert.equal(selectTrackedPose([profile], undefined, "down_the_line"), 0);
    assert.equal(selectTrackedPose([profile], undefined, "face_on"), -1);
    profile[23]!.visibility = 0.1;
    assert.equal(selectTrackedPose([profile], undefined, "down_the_line"), -1);
  });
});

describe("adaptive swing sampling", () => {
  // A complete swing in a long recording: its real downswing occupies only
  // 0.3 seconds, while the coarse scan has 0.125-second gaps.
  function sourceFrame(t: number): PoseFrame {
    let handY = 0.66;
    if (t >= 3 && t < 3.9) handY = 0.66 - (t - 3) / 0.9 * 0.41;
    else if (t >= 3.9 && t < 4.2) handY = 0.25 + (t - 3.9) / 0.3 * 0.41;
    else if (t >= 4.2) handY = Math.max(0.2, 0.66 - (t - 4.2) * 1.5);
    const imageLandmarks = Array.from({ length: 33 }, (): Landmark => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
    for (const [joint, x, y] of [[0, 0.5, 0.2], [11, 0.4, 0.35], [12, 0.6, 0.35], [23, 0.45, 0.6], [24, 0.55, 0.6], [27, 0.7, 0.9], [28, 0.3, 0.9], [15, 0.48, handY], [16, 0.52, handY]]) {
      imageLandmarks[joint!] = { x: x!, y: y!, z: 0, visibility: 0.95 };
    }
    return { t, imageLandmarks, landmarks: imageLandmarks };
  }

  it("recovers timing by focusing on a sparse hand arc instead of requiring timing before refinement", () => {
    for (const view of ["face_on", "down_the_line"] as const) {
      const coarse = Array.from({ length: 64 }, (_, index) => sourceFrame((index + 0.5) / 8));
      const original = structuredClone(coarse);
      assert.equal(findAutomaticTiming(coarse, 1, view), null);
      const times = refinementTimes(coarse, 0, 8, 1, view, 64);
      assert.ok(times.length <= 64 && times.length > 0);
      assert.equal(new Set(times).size, times.length);
      assert.ok(times.every((time) => time >= 0 && time <= 8));
      assert.ok(times.filter((time) => time >= 3.8 && time <= 4.35).length > times.length / 2);
      const refined = [...coarse, ...times.map(sourceFrame)].sort((a, b) => a.t - b.t);
      const result = findAutomaticTiming(refined, 1, view);
      assert.ok(result, `${view} should resolve from real additional observations`);
      assert.ok(Math.abs(refined[result.phases.top]!.t - 3.9) < 0.04);
      assert.ok(Math.abs(refined[result.phases.impact]!.t - 4.2) < 0.04);
      assert.deepEqual(coarse, original);
    }
  });

  it("keeps a bounded uniform refinement when there is no supported swing arc", () => {
    const still = Array.from({ length: 12 }, (_, index) => sourceFrame(index / 8));
    const times = refinementTimes(still, 0, 2, 1, "face_on", 16);
    assert.equal(times.length, 16);
    assert.equal(findAutomaticTiming([...still, ...times.map(sourceFrame)].sort((a, b) => a.t - b.t), 1), null);
    assert.deepEqual(refinementTimes(still, 0, 2, 1, "face_on", 0), []);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectTrackedPose } from "./pose-runner";
import type { Landmark } from "./golf/pose";

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

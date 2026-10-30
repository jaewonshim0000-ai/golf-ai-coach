import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { detectSwingPhases, wristY } from "./phases";

/**
 * Wrist series and phases from running GolfPosePro's notebook functions
 * verbatim (MediaPipe 0.10.21, its own ffmpeg re-encode) on its four sample
 * videos. Within a few frames of the notebook's printed Colab results.
 */
const reference: Record<string, { wristY: (number | null)[]; phases: Record<string, [number, number]>; swingStart: number; swingEnd: number }> =
  JSON.parse(readFileSync(new URL("./__fixtures__/notebook-reference.json", import.meta.url), "utf8"));

it("reproduces GolfPosePro's phases frame for frame on its four sample videos", () => {
  for (const [name, clip] of Object.entries(reference)) {
    const got = detectSwingPhases(clip.wristY)!;
    assert.deepEqual(got.phases, clip.phases, name);
    assert.equal(got.swingStart, clip.swingStart, name);
    assert.equal(got.swingEnd, clip.swingEnd, name);
  }
});

it("keeps the notebook's quirks: one unseen wrist frame blanks all later smoothing", () => {
  const got = detectSwingPhases([10, 10, 10, null, 10, 10, 10, 10])!;
  assert.ok(Number.isNaN(got.smoothed[1]!) && got.smoothed.slice(1).every(Number.isNaN));
  assert.equal(got.smoothed[0], 10);
  // The iron clip loses its wrists after the finish, which is where Follow Through ends.
  const iron = reference.IMG_1022!;
  assert.equal(iron.wristY.findIndex((v) => v === null) - 3, iron.swingEnd);
});

it("reads wrist height like the notebook: visible wrists over 0.4, averaged, in pixels", () => {
  const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  pose[15] = { x: 0.4, y: 0.6, visibility: 0.9 };
  pose[16] = { x: 0.6, y: 0.7, visibility: 0.3 };
  assert.equal(wristY(pose, 1000), 600);
  pose[16] = { x: 0.6, y: 0.7, visibility: 0.5 };
  assert.ok(Math.abs(wristY(pose, 1000)! - 650) < 1e-9);
  pose[15] = { ...pose[15]!, visibility: 0.4 };
  pose[16] = { ...pose[16]!, visibility: 0.4 };
  assert.equal(wristY(pose, 1000), null);
  assert.equal(wristY(null, 1000), null);
});

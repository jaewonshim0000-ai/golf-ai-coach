import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFraming } from "./framing";
import { LM, type Landmark } from "./pose";

/** A standing golfer: head at `top`, ankles at `bottom`, hips centred on `x`. */
function golfer(top: number, bottom: number, x = 0.5): Landmark[] {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x, y: (top + bottom) / 2, z: 0, visibility: 0.95 }));
  points[LM.nose] = { x, y: top, z: 0, visibility: 0.95 };
  points[LM.leftAnkle] = { x: x - 0.05, y: bottom, z: 0, visibility: 0.95 };
  points[LM.rightAnkle] = { x: x + 0.05, y: bottom, z: 0, visibility: 0.95 };
  return points;
}

test("passes a whole golfer with room for the club, and says what to fix otherwise", () => {
  assert.equal(checkFraming([golfer(0.25, 0.9)]).ok, true);
  assert.match(checkFraming([]).message, /Step into/);
  assert.match(checkFraming([golfer(0.25, 0.99)]).message, /feet/);
  assert.match(checkFraming([golfer(0.05, 0.9)]).message, /room above your head/);
  assert.match(checkFraming([golfer(0.4, 0.65)]).message, /closer/);
  assert.match(checkFraming([golfer(0.25, 0.9, 0.85)]).message, /middle/);
  const hidden = golfer(0.25, 0.9).map((point, joint) => joint === LM.leftAnkle || joint === LM.rightAnkle ? { ...point, visibility: 0.1 } : point);
  assert.match(checkFraming([hidden]).message, /head and feet/);
});

test("judges the golfer, not a smaller person in the background", () => {
  assert.equal(checkFraming([golfer(0.6, 0.75, 0.9), golfer(0.25, 0.9)]).ok, true);
});

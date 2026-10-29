import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFraming, detectView } from "./framing";
import { LM, type Landmark } from "./pose";
import { ASPECT, DOWN_THE_LINE, FACE_ON, film } from "./swing.fixture";

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

test("tells face on from down the line by how the shoulders line up", () => {
  for (const [camera, view] of [[FACE_ON, "face_on"], [DOWN_THE_LINE, "down_the_line"]] as const) {
    const frames = film(camera, 3).detected;
    // Address and early takeaway, as the capture's probe frames see them.
    for (const frame of frames.slice(0, 12)) assert.equal(detectView([frame.imageLandmarks!], ASPECT), view);
  }
  assert.equal(detectView([], ASPECT), null);
  const hidden = film(FACE_ON, 3).detected[0]!.imageLandmarks!.map((point) => ({ ...point, visibility: 0.1 }));
  assert.equal(detectView([hidden], ASPECT), null);
});

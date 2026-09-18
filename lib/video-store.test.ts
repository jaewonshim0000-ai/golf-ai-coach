import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { clampClip, clipWindow, type Clip } from "./video-store";

const clip = (start: number, end: number) => ({ id: "s1", blob: null, start, end }) as unknown as Clip;

describe("clip trimming", () => {
  it("keeps a sane trim as given", () => {
    assert.deepEqual(clampClip(0.4, 2.1, 5), [0.4, 2.1]);
  });

  it("drops an inverted or hairline trim back to the whole clip", () => {
    assert.deepEqual(clampClip(3, 1, 5), [0, 0]);
    assert.deepEqual(clampClip(1, 1.05, 5), [0, 0]);
  });

  it("refuses to trust a duration the browser has not measured yet", () => {
    assert.deepEqual(clampClip(0, 2, Number.NaN), [0, 0]);
  });

  it("clamps handles dragged past the ends", () => {
    assert.deepEqual(clampClip(-2, 99, 5), [0, 5]);
  });

  it("plays the whole clip when nothing is trimmed", () => {
    assert.deepEqual(clipWindow(null, 4), [0, 4]);
    assert.deepEqual(clipWindow(clip(0, 0), 4), [0, 4]);
    assert.deepEqual(clipWindow(clip(1, 2.5), 4), [1, 2.5]);
  });
});

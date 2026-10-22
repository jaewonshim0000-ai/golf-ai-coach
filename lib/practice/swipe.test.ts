import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SWIPE_REVEAL, swipeIntent, swipeOffset } from "./swipe";

describe("session swipe gestures", () => {
  it("separates taps and vertical scrolling from horizontal row actions", () => {
    assert.equal(swipeIntent(4, 3), "pending");
    assert.equal(swipeIntent(15, 80), "vertical");
    assert.equal(swipeIntent(65, 10), "horizontal");
    assert.equal(swipeIntent(-65, 10), "horizontal");
    assert.equal(swipeIntent(20, 20), "pending");
  });
  it("allows rightward reveal and leftward dismissal without overshooting the row", () => {
    assert.equal(swipeOffset(0, 60), 60);
    assert.equal(swipeOffset(0, 200), SWIPE_REVEAL);
    assert.equal(swipeOffset(0, -80), 0);
    assert.equal(swipeOffset(SWIPE_REVEAL, -40), SWIPE_REVEAL - 40);
    assert.equal(swipeOffset(SWIPE_REVEAL, -200), 0);
  });
});

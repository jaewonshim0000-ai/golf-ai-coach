import assert from "node:assert/strict";
import test from "node:test";

import { analysisPercent, creep, isRestart } from "./analysis-progress";

test("swing analysis progress runs 0 to 100 and reading frames fills most of it", () => {
  assert.equal(analysisPercent({ stage: "preparing" }), 0);
  assert.equal(analysisPercent({ stage: "reading", done: 0, total: 120 }), 8);
  assert.equal(analysisPercent({ stage: "reading", done: 60, total: 120 }), 48);
  assert.equal(analysisPercent({ stage: "reading", done: 120, total: 120 }), 88);
  assert.equal(analysisPercent({ stage: "saving" }), 88);
  assert.equal(analysisPercent({ stage: "done" }), 100);
});

test("the shown percent creeps forward, never back, and stops short of the next stage", () => {
  let shown = 0;
  for (let tick = 0; tick < 500; tick++) shown = creep(shown, { stage: "preparing" });
  assert.ok(shown > 6 && shown <= 7, `preparing settles just under 8, got ${shown}`);
  // A new stage below what is already shown never pulls the bar back.
  assert.equal(creep(50, { stage: "reading", done: 1, total: 100 }), 50);
  assert.equal(creep(10, { stage: "reading", done: 50, total: 100 }), 48);
  for (let tick = 0; tick < 500; tick++) shown = creep(shown, { stage: "saving" });
  assert.ok(shown > 96 && shown <= 97, `saving settles just under 98, got ${shown}`);
  assert.equal(creep(shown, { stage: "done" }), 100);
});

test("a new run after a finished one starts from zero", () => {
  assert.equal(isRestart(null, { stage: "preparing" }), true);
  assert.equal(isRestart({ stage: "done" }, { stage: "preparing" }), true);
  assert.equal(isRestart({ stage: "reading", done: 5, total: 9 }, { stage: "reading", done: 6, total: 9 }), false);
  assert.equal(isRestart({ stage: "reading", done: 9, total: 9 }, { stage: "saving" }), false);
});

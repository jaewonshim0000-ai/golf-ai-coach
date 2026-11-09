import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { coachComparison } from "./comparison-coach";
import { RulesProvider, setProvider, type AIProvider } from "./provider";
import type { SwingComparison } from "../golf/swing-comparison";

const head = { id: "head" as const, label: "Head control at impact", unit: "% stance", cue: "Try five waist-high swings.", concern: true, user: 22, reference: 8, excess: 14, tolerance: 8 };
const tempo = { id: "tempo" as const, label: "Rhythm", unit: ":1", cue: "Count one-two-three, four.", concern: false, user: 3.1, reference: 3, excess: 0.1, tolerance: 0.6 };
const comparison: SwingComparison = { status: "ready", message: "", referenceId: "ref", referenceName: "Test coach", userAnchors: null, referenceAnchors: null,
  mirrorReference: false, differences: [tempo, head], focus: { status: "issue", id: "head", issue: "Compared with Test coach, ...", steps: ["One.", "Two.", "Three."] } };
const answer = (data: unknown): AIProvider => ({ id: "test", model: "test", generate: async () => ({ data, source: "ai", model: "test" }) } as AIProvider);
afterEach(() => setProvider(null));

it("gives plain advice on each difference beyond tolerance without AI", async () => {
  setProvider(new RulesProvider());
  const { data, source, note } = await coachComparison(comparison, "7_iron");
  assert.equal(source, "rules"); assert.equal(note, undefined);
  assert.deepEqual(data.points.map((point) => [point.id, point.you, point.reference]), [["head", "22% stance", "8% stance"]]);
  assert.match(data.points[0]!.advice, /Compared with Test coach, your head moves farther sideways/);
  assert.equal(data.points[0]!.steps.length, 3);
});

it("uses Claude's advice but keeps the measured numbers", async () => {
  setProvider(answer({ summary: "Work on your head first.", points: [{ check_id: "head", advice: "Your head drifts toward the target more than the coach's." }] }));
  const { data, source } = await coachComparison(comparison, "7_iron");
  assert.equal(source, "ai");
  assert.equal(data.summary, "Work on your head first.");
  assert.equal(data.points[0]!.advice, "Your head drifts toward the target more than the coach's.");
  assert.equal(data.points[0]!.you, "22% stance");
});

it("rejects invented numbers, checks and missing points from Claude", async () => {
  for (const points of [
    [{ check_id: "head", advice: "Your head moves 14% more." }],
    [{ check_id: "club_path", advice: "Swing more inside." }],
    [],
  ]) {
    setProvider(answer({ summary: "Start here.", points }));
    const { data, source, note } = await coachComparison(comparison, "7_iron");
    assert.equal(source, "rules"); assert.ok(note);
    assert.match(data.points[0]!.advice, /Compared with Test coach/);
  }
});

it("does not call Claude when nothing differs beyond tolerance", async () => {
  setProvider({ id: "test", model: "test", generate: async () => { throw new Error("Should not call"); } });
  const { data } = await coachComparison({ ...comparison, differences: [tempo], focus: null }, "7_iron");
  assert.equal(data.points.length, 0);
  assert.match(data.summary, /No measured position stands out/);
  // A rhythm unlike the reference's is not a mistake while the player's own rhythm check is fine.
  const healthy = await coachComparison({ ...comparison, differences: [{ ...tempo, user: 2.7, reference: 1.7, excess: 1 }], focus: null }, "7_iron");
  assert.equal(healthy.data.points.length, 0);
});

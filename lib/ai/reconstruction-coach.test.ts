import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { cachedReconstructionCoach, coachReconstruction, coachingFingerprint } from "./reconstruction-coach";
import { RulesProvider, setProvider, type AIProvider } from "./provider";
import type { SwingScore } from "../golf/swing-score";
import type { PoseModel } from "../golf/pose";

const component = { id: "posture_3d", label: "Posture", score: 50, weight: 40, value: 20, unit: "°", time: 1.2,
  evidence: "The reconstructed torso loses about 20° of inclination.", cue: "Rehearse a slow half swing.", check: "Check the original video.", rubric: "Heuristic" };
const score: SwingScore = { total: null, components: [component], priorities: [component], reviews: [], missing: [], reason: null };
afterEach(() => setProvider(null));

it("builds useful coaching without AI and never calls AI on uncertain-only evidence", async () => {
  setProvider(new RulesProvider());
  const result = await coachReconstruction(score, "7_iron");
  assert.equal(result.source, "rules");
  assert.equal(result.data.priorities[0]!.evidence, component.evidence);
  assert.ok(result.data.priorities[0]!.drill.instructions.length);
  setProvider({ id: "test", model: "test", generate: async () => { throw new Error("Should not call"); } });
  const uncertain = await coachReconstruction({ ...score, priorities: [], reviews: [component] }, "7_iron");
  assert.equal(uncertain.data.priorities.length, 0);
  assert.match(uncertain.data.summary, /uncertain/);
});

it("rejects invented checks, drills, duplicate priorities and numerical claims from AI", async () => {
  for (const priorities of [
    [{ check_id: "club_speed", drill_id: "drill_half_swing_contact", explanation: "Work on speed." }],
    [{ check_id: "posture_3d", drill_id: "invented", explanation: "Work on posture." }],
    [{ check_id: "posture_3d", drill_id: "drill_half_swing_contact", explanation: "You turned 80 degrees." }],
    Array.from({ length: 2 }, () => ({ check_id: "posture_3d", drill_id: "drill_half_swing_contact", explanation: "Try a rehearsal." })),
  ]) {
    setProvider({ id: "test", model: "test", generate: async () => ({ data: { priorities }, source: "ai", model: "test" }) } as AIProvider);
    const result = await coachReconstruction(score, "7_iron");
    assert.equal(result.source, "rules");
    assert.equal(result.data.priorities[0]!.id, "posture_3d");
    assert.equal(result.data.priorities[0]!.evidence, component.evidence);
  }
});

it("accepts supported Claude choices without letting Claude change evidence or cues", async () => {
  setProvider({ id: "test", model: "test", generate: async () => ({ data: { priorities: [{ check_id: "posture_3d",
    drill_id: "drill_pump_transition", explanation: "A slow rehearsal may help you keep room for your arms." }] }, source: "ai", model: "test" }) } as AIProvider);
  const result = await coachReconstruction(score, "7_iron");
  assert.equal(result.source, "ai");
  assert.equal(result.data.priorities[0]!.evidence, component.evidence);
  assert.equal(result.data.priorities[0]!.cue, component.cue);
});

it("invalidates coaching when timing, confidence or coordinates change", () => {
  const model: PoseModel = { v: 1, handedness: "right", t: [0, 1, 2], phases: { address: 0, top: 1, impact: 2 },
    frames: [[[0, 0, 0, 1]], [[0, 0, 0, 1]], [[0, 0, 0, 1]]] };
  const key = coachingFingerprint(model, "7_iron", "test");
  for (const changed of [{ ...model, phasesConfirmed: true }, { ...model, t: [0, 1.1, 2] }, { ...model, ballSide: "left" as const }]) {
    assert.notEqual(coachingFingerprint(changed, "7_iron", "test"), key);
  }
  model.frames[0]![0]![3] = 0.2;
  assert.notEqual(coachingFingerprint(model, "7_iron", "test"), key);
});

it("coalesces identical requests and isolates coaching by owner", async () => {
  setProvider(new RulesProvider());
  let calls = 0;
  const run = async () => { calls++; return coachReconstruction(score, "7_iron"); };
  await Promise.all([cachedReconstructionCoach("player-a", "fixture", run), cachedReconstructionCoach("player-a", "fixture", run)]);
  assert.equal(calls, 1);
  await cachedReconstructionCoach("player-b", "fixture", run);
  assert.equal(calls, 2);
});

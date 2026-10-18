import assert from "node:assert/strict";
import { test } from "node:test";
import { cachedFaultCoaching, coachFaults, faultFingerprint } from "./fault-coach";
import { measureFaults, rankFaults } from "../golf/faults";
import type { MotionReading } from "../golf/motion-analysis";
import type { BallFlight } from "../golf/pose";
import type { AIProvider, GenerateRequest } from "./provider";

function provider(output: unknown, observed: (request: GenerateRequest<unknown>) => void = () => undefined): AIProvider {
  return { id: "test", model: "test", async generate<T>(request: GenerateRequest<T>) {
    observed(request as GenerateRequest<unknown>);
    const parsed = request.schema.safeParse(output);
    return { data: parsed.success ? parsed.data : request.fallback(), source: parsed.success ? "ai" : "rules", model: "test" };
  } };
}
const sway: MotionReading = { id: "hips_top", label: "Hip shift", phase: "top", value: -25, unit: "% stance", note: "", time: 1 };
const flight: BallFlight = { start: "right", curve: "draw_hook", contact: "thin" };
const feedback = rankFaults(measureFaults([sway], "face_on", "7_iron"), flight, "right");
const text = "Your hips drifted 25% toward your trail foot, which fits the thin push. Start with the stick drill.";

test("Claude words the ranked cards with their own drills and the numbers it was given", async () => {
  const coaching = await coachFaults(feedback, flight, "7_iron", provider({ explanations: [
    { id: "sway", drill: "drill_half_swing_contact", text },
    { id: "clubface", drill: "swing_grip_weaker", text: "The camera can't see your clubface, and the hook points to a face closed to the path." },
  ] }, (request) => {
    assert.equal(request.images, undefined);
    assert.equal(request.prompt.includes("imageFrames"), false);
  }));
  assert.equal(coaching.source, "ai");
  assert.equal(coaching.explanations[0]!.drill, "drill_half_swing_contact");
});

test("an invented fault, drill, number or order falls back to the rule wording", async () => {
  const valid = { id: "clubface", drill: "swing_grip_weaker", text: "The camera can't see your clubface, and the hook points to a face closed to the path." };
  for (const first of [
    { id: "early_extension", drill: "swing_trail_hip_stick", text },
    { id: "sway", drill: "drill_split_hand_face", text },
    { id: "sway", drill: "swing_trail_hip_stick", text: text.replace("25%", "40%") },
  ]) {
    const coaching = await coachFaults(feedback, flight, "7_iron", provider({ explanations: [first, valid] }));
    assert.equal(coaching.source, "rules");
    assert.equal(coaching.explanations[0]!.text, feedback.primary!.why);
  }
  const swapped = await coachFaults(feedback, flight, "7_iron", provider({ explanations: [valid, { id: "sway", drill: "swing_trail_hip_stick", text }] }));
  assert.equal(swapped.source, "rules");
});

test("identical requests share a call; players and evidence stay apart", async () => {
  const key = faultFingerprint(feedback, flight, "7_iron", "test");
  let calls = 0;
  const compute = () => { calls++; return coachFaults(feedback, flight, "7_iron", provider({})); };
  await Promise.all([cachedFaultCoaching("player1:swing", key, compute), cachedFaultCoaching("player1:swing", key, compute)]);
  assert.equal(calls, 1);
  await cachedFaultCoaching("player2:swing", key, compute);
  assert.equal(calls, 2);
  assert.notEqual(faultFingerprint(feedback, { ...flight, contact: "fat" }, "7_iron", "test"), key);
});

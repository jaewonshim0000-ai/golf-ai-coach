import assert from "node:assert/strict";
import { it } from "node:test";
import { faceOnSwing } from "../golf/__fixtures__/face-on";
import { buildVideoModel } from "../golf/video-review";
import { RulesProvider, type AIProvider, type GenerateRequest } from "./provider";
import { generateSwingFeedback, rulesFeedback, savedSwingFeedback, swingFacts, swingFeedbackKey } from "./swing-feedback";

function headShift() {
  const frames = faceOnSwing();
  for (const frame of frames) if (frame.t > 1.5) frame.imageLandmarks![0]!.x = 0.72;
  return buildVideoModel(frames, { aspect: 1, view: "face_on", handedness: "right" });
}
function provider(output: unknown, observe: (request: GenerateRequest<unknown>) => void = () => undefined): AIProvider {
  return { id: "test", model: "test", async generate<T>(request: GenerateRequest<T>) {
    observe(request as GenerateRequest<unknown>);
    return { data: output as T, source: "ai", model: "test" };
  } };
}
const reply = (evidence: string, summary = "A solid swing with one clear thing to tidy up.") => ({
  summary, strengths: ["Your lead arm stays long at the top."],
  priorities: [{ title: "Keep your head behind the ball", phase: "impact", evidence, why: "It moves the low point.",
    fix: ["Feel your head stay back as you turn through."], drill: "Hit ten half shots with a headcover just outside your lead ear." }],
  phases: [{ phase: "top", note: "Hands well above your shoulders." }], practice: ["Start with half swings."], caveats: [],
});

it("sends measured facts, not joints or video, and keeps AI feedback that quotes them", async () => {
  const input = swingFacts(headShift(), "7_iron");
  const head = input.readings.find((row) => row.id === "head_impact")!;
  const feedback = await generateSwingFeedback(input, provider(reply(`Your head moves ${head.value}% of your stance toward the target at contact.`), (request) => {
    assert.equal(request.images, undefined);
    const facts = JSON.parse(request.prompt);
    assert.equal(request.prompt.includes("imageLandmarks"), false);
    assert.equal(facts.club, "7 Iron");
    assert.deepEqual(facts.phases.map((phase: { phase: string }) => phase.phase), ["address", "backswing", "top", "downswing", "impact", "follow_through"]);
    assert.ok(facts.measurements.some((row: { id: string }) => row.id === "hands_top"));
    assert.match(facts.best_supported_issue, /head/);
  }));
  assert.equal(feedback.source, "ai");
  assert.equal(feedback.status, "issue");
  assert.equal(feedback.priorities[0]!.title, "Keep your head behind the ball");
  assert.equal(feedback.strengths.length, 1);
  // A change between two phases of one measurement is a given figure too.
  const elbow = (phase: string) => input.readings.find((row) => row.id === `arm_${phase}`)!.value;
  const change = Math.round(Math.abs(elbow("address") - elbow("top")) * 10) / 10;
  const derived = await generateSwingFeedback(input, provider(reply(`Your lead elbow folds ${change}° from address to the top.`)));
  assert.equal(derived.priorities[0]!.title, "Keep your head behind the ball");
});

it("drops quoted figures the measurements do not contain, and keeps the supported issue", async () => {
  const input = swingFacts(headShift(), "7_iron");
  const feedback = await generateSwingFeedback(input, provider(reply("Your head moves 73.4% of your stance at contact.", "Your clubhead speed is 97.3 mph.")));
  assert.equal(feedback.source, "ai");
  assert.equal(feedback.summary, rulesFeedback(input).summary);
  assert.deepEqual(feedback.priorities, rulesFeedback(input).priorities);
  // Malformed output falls back entirely.
  assert.equal((await generateSwingFeedback(input, provider({ summary: "Hi" }))).source, "rules");
});

it("works without AI, and never asks AI to coach an unreadable recording", async () => {
  const rules = await generateSwingFeedback(swingFacts(headShift(), "driver"), new RulesProvider());
  assert.equal(rules.source, "rules");
  assert.equal(rules.priorities.length, 1);
  assert.equal(rules.priorities[0]!.phase, "impact");
  assert.ok(rules.phases.some((item) => item.phase === "top"));
  const clear = buildVideoModel(faceOnSwing(), { aspect: 1, view: "face_on", handedness: "right" });
  const unusable = await generateSwingFeedback(swingFacts({ ...clear, imageFrames: [] }, "driver"), provider({}, () => assert.fail("Unreadable footage must not call AI")));
  assert.equal(unusable.status, "needs_input");
  assert.ok(unusable.practice.length > 0);
});

it("keys saved feedback to the tracks, club, model and reference, not the revision", async () => {
  const model = headShift();
  const key = swingFeedbackKey(model, "7_iron", "claude");
  assert.equal(swingFeedbackKey({ ...model, revision: "a2b2c3d4-0000-4000-8000-000000000000", feedback: { key, data: {} } }, "7_iron", "claude"), key);
  assert.notEqual(swingFeedbackKey(model, "driver", "claude"), key);
  assert.notEqual(swingFeedbackKey(model, "7_iron", "other"), key);
  assert.notEqual(swingFeedbackKey(model, "7_iron", "claude", { id: "ref", model }), key);
  const feedback = rulesFeedback(swingFacts(model, "7_iron"));
  assert.deepEqual(savedSwingFeedback({ ...model, feedback: { key, data: feedback } }, key), feedback);
  assert.equal(savedSwingFeedback({ ...model, feedback: { key, data: feedback } }, "stale"), null);
  assert.equal(savedSwingFeedback({ ...model, feedback: { key, data: { summary: 3 } } }, key), null);
});

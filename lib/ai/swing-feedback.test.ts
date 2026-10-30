import assert from "node:assert/strict";
import { it } from "node:test";
import { golfPoseProResult } from "../golfposepro/result";
import { ironPoses } from "../golfposepro/__fixtures__/poses";
import { RulesProvider, type AIProvider, type GenerateRequest } from "./provider";
import { generateSwingFeedback, rulesFeedback, savedSwingFeedback, swingFacts, swingFeedbackKey } from "./swing-feedback";

const result = golfPoseProResult(ironPoses(), 30, 720, 1280)!.result;
function provider(output: unknown, observe: (request: GenerateRequest<unknown>) => void = () => undefined): AIProvider {
  return { id: "test", model: "test", async generate<T>(request: GenerateRequest<T>) {
    observe(request as GenerateRequest<unknown>);
    return { data: output as T, source: "ai", model: "test" };
  } };
}
const reply = (evidence: string, summary = "A full swing with a quick transition.") => ({
  summary, strengths: ["You finish with your hands high."],
  priorities: [{ title: "Let the backswing finish", phase: "Backswing", evidence, why: "A rushed top costs timing.",
    fix: ["Count one-two going back."] }],
  phases: [{ phase: "Top", note: "Hands well above your head." }],
  practice: [
    { title: "Pause at the top", phase: "Top", why: "Finishing the backswing gives the downswing time.", steps: ["Swing to the top and hold for one count."],
      dose: "3 sets of 10 swings, 3 days a week", drill: "drill_pause_at_top" },
    { title: "Feet-together swings", phase: "Downswing", why: "Balance shows a rushed start.", steps: ["Hit half shots with your feet together."],
      dose: "20 balls before each session", drill: "drill_made_up" },
    { title: "Speed ladder", phase: "Impact", why: "You swing at 113.7 mph.", steps: ["Swing faster."], dose: "10 swings" },
  ],
  caveats: [],
});

it("sends GolfPosePro's exact values and the key-frame images, not raw video", async () => {
  const input = swingFacts(result, "7_iron", "right");
  const [start, end] = result.phases.Backswing;
  const feedback = await generateSwingFeedback(input, provider(reply(`Your backswing runs from frame ${start} to ${end}.`), (request) => {
    assert.equal(request.images?.length, 6);
    const facts = JSON.parse(request.prompt);
    assert.equal(facts.club, "7 Iron");
    assert.deepEqual(facts.phases.map((phase: { start_frame: number; end_frame: number }) => [phase.start_frame, phase.end_frame]), Object.values(result.phases));
    assert.equal(facts.video.frames_read, 564);
    assert.equal(facts.key_frames.length, 6);
    assert.equal(facts.key_frames[2].frame, result.keyFrames[2]!.frame);
    assert.ok(facts.wrist_height.values.length > 20);
  }), ["/9j/a", "/9j/b", "/9j/c", "/9j/d", "/9j/e", "/9j/f"]);
  assert.equal(feedback.source, "ai");
  assert.equal(feedback.priorities[0]!.phase, "Backswing");
});

it("keeps library drills it offered, drops unknown ids and practices quoting invented figures", async () => {
  const input = swingFacts(result, "7_iron", "right");
  const feedback = await generateSwingFeedback(input, provider(reply("Your backswing is quick."), (request) => {
    assert.match(request.system, /drill_pause_at_top: Pause-at-the-Top Transition/);
    assert.doesNotMatch(request.system, /drill_lag_ladder/);
  }));
  assert.deepEqual(feedback.practice.map((item) => [item.title, item.drill]), [["Pause at the top", "drill_pause_at_top"], ["Feet-together swings", null]]);
  assert.equal(feedback.practice[0]!.dose, "3 sets of 10 swings, 3 days a week");
});

it("drops quoted figures GolfPosePro did not produce", async () => {
  const input = swingFacts(result, "7_iron", "right");
  const feedback = await generateSwingFeedback(input, provider(reply("Your hands reach 97.3 mph.", "Your clubhead speed is 113.7 mph.")));
  assert.equal(feedback.source, "ai");
  assert.equal(feedback.priorities.length, 0);
  assert.equal(feedback.summary, rulesFeedback(input).summary);
  assert.equal((await generateSwingFeedback(input, provider({ summary: "Hi" }))).source, "rules");
});

it("gives a report from GolfPosePro alone without AI", async () => {
  const rules = await generateSwingFeedback(swingFacts(result, "driver", "right"), new RulesProvider());
  assert.equal(rules.source, "rules");
  assert.match(rules.summary, /564 frames/);
  assert.equal(rules.phases.length, 6);
});

it("keys saved feedback to the result, club, handedness and model", () => {
  const key = swingFeedbackKey(result, "7_iron", "right", "claude");
  assert.notEqual(swingFeedbackKey(result, "driver", "right", "claude"), key);
  assert.notEqual(swingFeedbackKey(result, "7_iron", "left", "claude"), key);
  assert.notEqual(swingFeedbackKey(result, "7_iron", "right", "other"), key);
  assert.notEqual(swingFeedbackKey({ ...result, swingEnd: result.swingEnd + 1 }, "7_iron", "right", "claude"), key);
  const feedback = rulesFeedback(swingFacts(result, "7_iron", "right"));
  assert.deepEqual(savedSwingFeedback({ key, data: feedback }, key), feedback);
  assert.equal(savedSwingFeedback({ key, data: feedback }, "stale"), null);
  assert.equal(savedSwingFeedback({ key, data: { summary: 3 } }, key), null);
});

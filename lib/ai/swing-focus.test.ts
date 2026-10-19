import assert from "node:assert/strict";
import { it } from "node:test";
import { faceOnSwing } from "../golf/__fixtures__/face-on";
import { buildVideoModel, analyseVideoModel } from "../golf/video-review";
import { getSwingFocus, swingFocusProcedure } from "../golf/swing-focus";
import { cachedSwingFocus, coachSwingFocus, swingFocusFingerprint } from "./swing-focus";
import { RulesProvider, type AIProvider, type GenerateRequest } from "./provider";

function model() {
  const frames = faceOnSwing();
  for (const frame of frames) if (frame.t > 1.5) frame.imageLandmarks![0]!.x = 0.72;
  return buildVideoModel(frames, { aspect: 1, view: "face_on", handedness: "right" });
}

function provider(output: unknown, observe: (request: GenerateRequest<unknown>) => void = () => undefined): AIProvider {
  return { id: "test", model: "test", async generate<T>(request: GenerateRequest<T>) {
    observe(request as GenerateRequest<unknown>);
    // Return unchecked data to verify the boundary also handles injected providers.
    return { data: output as T, source: "ai", model: "test" };
  } };
}

it("selects targeted procedures without letting AI change the problem or invent steps", async () => {
  const recording = model();
  const plan = await coachSwingFocus(recording, "7_iron", provider({ procedure: "half_shots" }, (request) => {
    assert.equal(request.images, undefined);
    assert.equal(request.prompt.includes("landmarks"), false);
    const data = JSON.parse(request.prompt);
    assert.match(data.issue, /head/);
    assert.deepEqual(data.procedures.half_shots, swingFocusProcedure("head", "half_shots"));
  }));
  assert.equal(plan.source, "ai");
  assert.equal(plan.status, "issue");
  assert.equal(plan.id, "head");
  assert.equal(plan.issue, getSwingFocus(analyseVideoModel(recording)).issue);
  assert.deepEqual(plan.steps, swingFocusProcedure("head", "half_shots"));
  for (const output of [{ procedure: "invented" }, { procedure: "half_shots", issue: "Your feet are misplaced." },
    { procedure: "rehearsal", steps: ["Freeze your head."] }]) {
    const fallback = await coachSwingFocus(recording, "7_iron", provider(output));
    assert.equal(fallback.source, "rules");
    assert.deepEqual(fallback.steps, swingFocusProcedure("head", "rehearsal"));
  }
});

it("keeps a useful immediate procedure without AI and skips AI when no issue is supported", async () => {
  const plan = await coachSwingFocus(model(), "driver", new RulesProvider());
  assert.equal(plan.id, "head");
  assert.equal(plan.source, "rules");
  assert.equal(plan.steps.length, 3);
  const clear = buildVideoModel(faceOnSwing(), { aspect: 1, view: "face_on", handedness: "right" });
  const noIssue = await coachSwingFocus(clear, "driver", provider({}, () => assert.fail("No supported issue must not call AI")));
  assert.equal(noIssue.id, null);
  assert.equal(noIssue.status, "clear");
  const unusable = { ...clear, imageFrames: [] };
  assert.equal((await coachSwingFocus(unusable, "driver", provider({}, () => assert.fail("Unusable footage must not call AI")))).id, null);
});

it("invalidates coaching for changed recording evidence and isolates cached requests by player", async () => {
  const recording = model();
  const key = swingFocusFingerprint(recording, "driver", "test");
  for (const changed of [{ ...recording, phasesConfirmed: true }, { ...recording, ballSide: "left" as const },
    { ...recording, clip: [0.2, 2] as [number, number] }, { ...recording, cameraAngle: "down_the_line" as const }]) {
    assert.notEqual(swingFocusFingerprint(changed, "driver", "test"), key);
  }
  let calls = 0;
  const compute = () => { calls++; return coachSwingFocus(recording, "driver", new RulesProvider()); };
  await Promise.all([cachedSwingFocus("player1:swing", key, compute), cachedSwingFocus("player1:swing", key, compute)]);
  assert.equal(calls, 1);
  await cachedSwingFocus("player2:swing", key, compute);
  assert.equal(calls, 2);
  await assert.rejects(cachedSwingFocus("failure", key, () => Promise.reject(new Error("Unavailable"))));
  await cachedSwingFocus("failure", key, compute);
  assert.equal(calls, 3);
});

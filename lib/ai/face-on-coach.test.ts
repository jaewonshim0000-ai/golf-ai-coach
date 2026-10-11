import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cachedFaceOnPractice, coachFaceOn, faceOnFingerprint } from "./face-on-coach";
import { reviewFaceOn } from "../golf/face-on-review";
import { faceOnSwing } from "../golf/__fixtures__/face-on";
import type { AIProvider, GenerateRequest } from "./provider";

function provider(output: unknown, observed: (request: GenerateRequest<unknown>) => void = () => undefined): AIProvider {
  return { id: "test", model: "test", async generate<T>(request: GenerateRequest<T>) {
    observed(request as GenerateRequest<unknown>);
    const parsed = request.schema.safeParse(output);
    return { data: parsed.success ? parsed.data : request.fallback(), source: parsed.success ? "ai" : "rules", model: "test" };
  } };
}
describe("face-on practice boundary", () => {
  it("allows only maintained exercises and sends no video or raw joints", async () => {
    const review = reviewFaceOn(faceOnSwing(), 1);
    const plan = await coachFaceOn(review, "7_iron", provider({ drill: "easy_practice_swings" }, (request) => {
      assert.equal(request.images, undefined);
      assert.equal(request.prompt.includes("landmarks"), false);
      assert.equal(request.prompt.includes("setup"), true);
    }));
    assert.equal(plan.source, "ai");
    assert.equal(plan.steps.length, 3);
    assert.ok(plan.steps[0]!.includes("naturally"));
  });
  it("rejects invented drills or added diagnoses and retains the immediate default plan", async () => {
    const review = reviewFaceOn(faceOnSwing(), 1);
    for (const output of [{ drill: "freeze_head" }, { drill: "repeat_rhythm", diagnosis: "bad swing" }]) {
      const plan = await coachFaceOn(review, "driver", provider(output));
      assert.equal(plan.source, "rules");
      assert.deepEqual(plan.steps, review.practice.steps);
    }
  });
  it("does not call Claude for unusable footage", async () => {
    await coachFaceOn(reviewFaceOn([], 1), "driver", provider({}, () => assert.fail("unusable footage must not call AI")));
  });
  it("shares identical requests but isolates players and evidence changes", async () => {
    const review = reviewFaceOn(faceOnSwing(), 1), key = faceOnFingerprint(review, "driver", "test");
    let calls = 0;
    const compute = () => { calls++; return coachFaceOn(review, "driver", provider({ drill: "repeat_rhythm" })); };
    await Promise.all([cachedFaceOnPractice("player1:swing", key, compute), cachedFaceOnPractice("player1:swing", key, compute)]);
    assert.equal(calls, 1);
    await cachedFaceOnPractice("player2:swing", key, compute);
    assert.equal(calls, 2);
    assert.notEqual(faceOnFingerprint({ ...review, window: [0.2, 1.6] }, "driver", "test"), key);
  });
});

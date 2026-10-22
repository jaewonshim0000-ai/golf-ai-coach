import assert from "node:assert/strict";
import { beforeEach, it } from "node:test";
process.env.ENABLE_DEMO_MODE = "true";
import { getSwingReferences, saveSwingReference, saveSwingModel, deleteSwingSession, DEMO_USER_ID } from "./repo";
import { resetDemoStore, store } from "./demo-store";
import { buildVideoModel } from "../golf/video-review";
import { faceOnSwing } from "../golf/__fixtures__/face-on";
import { compactMotionModel, expandMotionModel } from "../golf/motion-storage";

const metadata = { name: "Test reference", kind: "coach" as const, handedness: "left" as const, source: "Owned test footage", permission: true as const };
beforeEach(() => resetDemoStore());

it("persists references through compact storage and removal keeps the video and tracks", async () => {
  const model = buildVideoModel(faceOnSwing(), { aspect: 1, view: "face_on", handedness: "right" });
  await saveSwingModel(DEMO_USER_ID, "swing_2", model);
  await saveSwingReference(DEMO_USER_ID, "swing_2", metadata);
  const refs = await getSwingReferences(DEMO_USER_ID);
  assert.equal(refs.length, 1); assert.equal(refs[0]!.model.handedness, "left");
  assert.deepEqual(refs[0]!.metadata, metadata);
  assert.deepEqual(expandMotionModel(compactMotionModel(refs[0]!.model))!.reference, metadata);
  await saveSwingReference(DEMO_USER_ID, "swing_2", null);
  assert.equal((await getSwingReferences(DEMO_USER_ID)).length, 0);
  assert.ok(store().swingModels.swing_2);
  assert.ok(store().swingSessions.some((session) => session.id === "swing_2"));
});

it("isolates private references by owner and removes a deleted or stale clip from matching", async () => {
  const model = buildVideoModel(faceOnSwing(), { aspect: 1, view: "face_on", handedness: "right", clip: [0, 2.4] });
  await saveSwingModel(DEMO_USER_ID, "swing_2", model);
  await saveSwingReference(DEMO_USER_ID, "swing_2", metadata);
  assert.equal((await getSwingReferences("other-player")).length, 0);
  await assert.rejects(saveSwingReference("other-player", "swing_2", metadata));
  store().swingSessions.find((session) => session.id === "swing_2")!.clip_start = 0.5;
  assert.equal((await getSwingReferences(DEMO_USER_ID)).length, 0);
  await deleteSwingSession(DEMO_USER_ID, "swing_2");
  assert.equal((await getSwingReferences(DEMO_USER_ID)).length, 0);
});

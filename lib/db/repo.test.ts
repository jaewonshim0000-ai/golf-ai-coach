import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";

// The repository refuses to write without a connection unless demo mode is on,
// which is the point of that guard. Set it before the module is loaded.
process.env.ENABLE_DEMO_MODE = "true";

import { resetDemoStore, store } from "./demo-store";
import {
  DEMO_USER_ID,
  deletePracticeSession,
  getPracticeSession,
  deleteSwingSession,
  deleteSwingMeasurementsBySource,
  getSwingSessions,
  saveSwingClip,
  getPracticeDrillPriorities,
  savePracticeDrillPriorities,
  saveSwingModel,
  getSwingModel,
} from "./repo";
import { faceOnSwing } from "../golf/__fixtures__/face-on";
import { buildVideoModel } from "../golf/video-review";

describe("practice priorities storage", () => {
  beforeEach(() => resetDemoStore());

  it("saves, reopens, and clears a player's choices", async () => {
    await savePracticeDrillPriorities(DEMO_USER_ID, ["test_putt_gate", "test_short_chip"]);
    assert.deepEqual(await getPracticeDrillPriorities(DEMO_USER_ID), ["test_putt_gate", "test_short_chip"]);
    await savePracticeDrillPriorities(DEMO_USER_ID, []);
    assert.deepEqual(await getPracticeDrillPriorities(DEMO_USER_ID), []);
  });

  it("rejects another player's write without changing the current priorities", async () => {
    await savePracticeDrillPriorities(DEMO_USER_ID, ["test_putt_gate"]);
    await assert.rejects(savePracticeDrillPriorities("another-player", ["test_short_chip"]));
    assert.deepEqual(await getPracticeDrillPriorities(DEMO_USER_ID), ["test_putt_gate"]);
  });
});

/**
 * These run against the in-memory store, which is the shape the Supabase
 * queries mirror. They pin the two behaviours that would be silently wrong
 * rather than loudly broken: a trim that does not survive a reload, and a
 * delete that leaves measurements behind.
 */
describe("swing storage", () => {
  beforeEach(() => resetDemoStore());

  it("rejects stale analyses, changed trims and another player's write atomically", async () => {
    const session = (await getSwingSessions(DEMO_USER_ID)).find((s) => s.id === "swing_1")!;
    const model = buildVideoModel(faceOnSwing(), { aspect: 1, view: "face_on", handedness: "right" });
    const guard = { revision: null, videoUrl: session.video_url, clipStart: session.clip_start, clipEnd: session.clip_end };
    await saveSwingModel(DEMO_USER_ID, session.id, model, guard);
    const saved = (await getSwingModel(DEMO_USER_ID, session.id))!;
    assert.ok(saved.revision);
    await assert.rejects(saveSwingModel(DEMO_USER_ID, session.id, model, guard), /changed during analysis/);
    await assert.rejects(saveSwingModel("another-player", session.id, model, guard), /unavailable/);
    await saveSwingClip(DEMO_USER_ID, session.id, { start: 0.2, end: 2 });
    await assert.rejects(saveSwingModel(DEMO_USER_ID, session.id, model, { ...guard, revision: saved.revision! }), /changed during analysis/);
    assert.equal((await getSwingModel(DEMO_USER_ID, session.id))!.revision, saved.revision);
  });

  it("saves a trim on the swing itself so it survives a reload", async () => {
    await saveSwingClip(DEMO_USER_ID, "swing_1", { start: 0.4, end: 2.1 });
    const [session] = (await getSwingSessions(DEMO_USER_ID)).filter((s) => s.id === "swing_1");
    assert.equal(session?.clip_start, 0.4);
    assert.equal(session?.clip_end, 2.1);
  });

  it("clears the trim back to the whole clip", async () => {
    await saveSwingClip(DEMO_USER_ID, "swing_1", { start: 0.4, end: 2.1 });
    await saveSwingClip(DEMO_USER_ID, "swing_1", null);
    const [session] = (await getSwingSessions(DEMO_USER_ID)).filter((s) => s.id === "swing_1");
    assert.equal(session?.clip_start, null);
    assert.equal(session?.clip_end, null);
  });

  it("leaves other swings alone when one is trimmed", async () => {
    await saveSwingClip(DEMO_USER_ID, "swing_1", { start: 1, end: 2 });
    const others = (await getSwingSessions(DEMO_USER_ID)).filter((s) => s.id !== "swing_1");
    assert.ok(others.every((session) => session.clip_start === null));
  });

  it("takes the measurements and findings with the swing it deletes", async () => {
    const before = store();
    assert.ok(before.swingMeasurements.some((m) => m.swing_session_id === "swing_1"));

    await deleteSwingSession(DEMO_USER_ID, "swing_1");

    const after = store();
    assert.equal(
      after.swingSessions.filter((session) => session.id === "swing_1").length,
      0,
    );
    assert.equal(
      after.swingMeasurements.filter((m) => m.swing_session_id === "swing_1").length,
      0,
    );
    assert.equal(
      after.swingFindings.filter((f) => f.swing_session_id === "swing_1").length,
      0,
    );
  });

  it("leaves a different swing's data in place", async () => {
    const kept = store().swingSessions.filter((session) => session.id !== "swing_1").length;
    await deleteSwingSession(DEMO_USER_ID, "swing_1");
    assert.equal(store().swingSessions.length, kept);
  });

  it("replaces only the previous automated pose reading", async () => {
    const before = store();
    const sessionId = "swing_1";
    before.swingMeasurements.push(
      {
        id: "pose_old",
        swing_session_id: sessionId,
        phase: "top",
        metric: "chest_turn_top",
        value: 170,
        unit: "deg",
        confidence: 0.8,
        source: "pose",
      },
      {
        id: "manual_keep",
        swing_session_id: sessionId,
        phase: "top",
        metric: "pelvis_turn_top",
        value: 42,
        unit: "deg",
        confidence: 1,
        source: "manual",
      },
    );

    await deleteSwingMeasurementsBySource(DEMO_USER_ID, sessionId, "pose");

    assert.equal(store().swingMeasurements.some((row) => row.id === "pose_old"), false);
    assert.equal(store().swingMeasurements.some((row) => row.id === "manual_keep"), true);
  });
});

describe("practice storage", () => {
  beforeEach(() => resetDemoStore());

  it("deletes a session with its blocks and recorded attempts", async () => {
    const sessionId = store().practiceSessions.find((session) =>
      store().drillAttempts.some((attempt) => attempt.session_id === session.id),
    )?.id;
    assert.ok(sessionId);

    await deletePracticeSession(DEMO_USER_ID, sessionId);

    assert.equal(store().practiceSessions.some((session) => session.id === sessionId), false);
    assert.equal(store().practiceItems.some((item) => item.session_id === sessionId), false);
    assert.equal(store().drillAttempts.some((attempt) => attempt.session_id === sessionId), false);
  });
  it("leaves other sessions, blocks and attempts intact when a practice is deleted", async () => {
    const sessionId = store().practiceSessions[0]!.id;
    const others = store().practiceSessions.filter((session) => session.id !== sessionId);
    const items = store().practiceItems.filter((item) => item.session_id !== sessionId);
    const attempts = store().drillAttempts.filter((attempt) => attempt.session_id !== sessionId);
    await deletePracticeSession(DEMO_USER_ID, sessionId);
    assert.deepEqual(store().practiceSessions, others);
    assert.deepEqual(store().practiceItems, items);
    assert.deepEqual(store().drillAttempts, attempts);
  });
  it("does not read or delete another player's practice", async () => {
    const sessionId = store().practiceSessions[0]!.id;
    const before = structuredClone(store());
    assert.equal(await getPracticeSession("another-player", sessionId), null);
    await deletePracticeSession("another-player", sessionId);
    assert.deepEqual(store(), before);
  });
});

import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";

// The repository refuses to write without a connection unless demo mode is on,
// which is the point of that guard. Set it before the module is loaded.
process.env.ENABLE_DEMO_MODE = "true";

import { resetDemoStore, store } from "./demo-store";
import {
  DEMO_USER_ID,
  deletePracticeSession,
  deleteSwingSession,
  getSwingSessions,
  saveSwingClip,
} from "./repo";

/**
 * These run against the in-memory store, which is the shape the Supabase
 * queries mirror. They pin the two behaviours that would be silently wrong
 * rather than loudly broken: a trim that does not survive a reload, and a
 * delete that leaves measurements behind.
 */
describe("swing storage", () => {
  beforeEach(() => resetDemoStore());

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
});

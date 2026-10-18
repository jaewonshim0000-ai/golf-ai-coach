import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";

process.env.ENABLE_DEMO_MODE = "true";

import { resetDemoStore, store } from "./db/demo-store";
import { DEMO_USER_ID, updateRound } from "./db/repo";
import { loadPlayerState } from "./player-state";

/**
 * The first five minutes of a real account: a profile and nothing else.
 *
 * Every screen reads from this one object, so anything that throws here is a
 * crash on the first page a new player opens - the one path the demo data can
 * never exercise, because the demo player arrives with eight rounds already
 * logged.
 */
function emptyAccount() {
  resetDemoStore();
  const state = store();
  state.rounds = [];
  state.shots = [];
  state.practiceSessions = [];
  state.practiceItems = [];
  state.drillAttempts = [];
  state.swingSessions = [];
  state.swingFindings = [];
  state.swingMeasurements = [];
  state.handicapHistory = [];
  state.courses = [];
}

describe("a brand new account", () => {
  beforeEach(emptyAccount);

  it("builds without throwing", async () => {
    const state = await loadPlayerState(DEMO_USER_ID);
    assert.equal(state.hasData, false);
    assert.equal(state.rounds.length, 0);
  });

  it("reports no strokes gained rather than dividing by zero", async () => {
    const state = await loadPlayerState(DEMO_USER_ID);
    assert.equal(state.summary.rounds, 0);
    assert.equal(state.summary.per_round, 0);
    assert.ok(Number.isFinite(state.summary.total));
    for (const category of Object.values(state.summary.by_category)) {
      assert.ok(Number.isFinite(category.per_round), `${category.category} is not a number`);
    }
  });

  it("names no priority it cannot support", async () => {
    const state = await loadPlayerState(DEMO_USER_ID);
    assert.deepEqual(state.weaknesses, []);
    assert.deepEqual(state.segments, []);
  });

  it("still offers a first session to run", async () => {
    const state = await loadPlayerState(DEMO_USER_ID);
    assert.ok(state.session, "a new player with no data still needs somewhere to start");
    assert.ok(state.session!.drills.length > 0);
  });

  it("has empty trends rather than fabricated ones", async () => {
    const state = await loadPlayerState(DEMO_USER_ID);
    assert.deepEqual(state.sgTrend, []);
    assert.deepEqual(state.scoringTrend, []);
    assert.deepEqual(state.practiceTrends, []);
  });

  it("keeps the drill library, which is reference data rather than player data", async () => {
    const state = await loadPlayerState(DEMO_USER_ID);
    assert.ok(state.drills.length > 0);
  });
});

describe("a round left out of the analysis", () => {
  beforeEach(() => resetDemoStore());

  it("stays listed with its shots but feeds no number", async () => {
    const before = await loadPlayerState(DEMO_USER_ID);
    const storm = before.rounds.find((round) => (before.shotsByRound.get(round.id) ?? []).length > 0)!;
    await updateRound(DEMO_USER_ID, storm.id, { excluded_from_analysis: true });

    const after = await loadPlayerState(DEMO_USER_ID);
    assert.equal(after.allRounds.length, before.allRounds.length);
    assert.equal(after.rounds.length, before.rounds.length - 1);
    assert.ok(after.shotsByRound.get(storm.id)?.length, "its own card still needs its shots");
    assert.ok(!after.shots.some((shot) => shot.round_id === storm.id));
    assert.equal(after.summary.rounds, before.summary.rounds - 1);
    assert.equal(after.summary.shots, before.summary.shots - after.shotsByRound.get(storm.id)!.length);

    await updateRound(DEMO_USER_ID, storm.id, { excluded_from_analysis: false });
    assert.deepEqual((await loadPlayerState(DEMO_USER_ID)).summary, before.summary);
  });
});

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { PracticeMetricTrend, Weakness } from "../../types/analytics";
import type { PlayerProfile } from "../../types/player";
import { DRILLS_BY_ID } from "../seed/drills";
import { buildPlanSkeleton, evaluatePlanProgress, practiceDays, selectDrills } from "./plan-builder";

const profile: PlayerProfile = {
  id: "p1",
  user_id: "u1",
  display_name: "Demo",
  handicap_index: 11.8,
  experience_level: "intermediate",
  dominant_hand: "right",
  typical_score: 85,
  average_driver_distance: 255,
  swing_pattern: "draw",
  common_miss: "right",
  primary_goal: "improve_approach",
  secondary_goals: ["break_80"],
  practice_days_per_week: 4,
  typical_practice_duration: 45,
  facilities: ["range", "putting_green", "short_game_area"],
  bag: ["driver", "3_wood", "5_iron", "7_iron", "9_iron", "pw", "sw", "putter"],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const weakness: Weakness = {
  id: "approach_distance:150-175",
  kind: "approach_distance",
  key: "150-175",
  title: "150–175 yd approach",
  category: "approach",
  severity: "significant",
  confidence: 0.82,
  sample_size: 24,
  sufficient_sample: true,
  strokes_lost_per_round: 1.7,
  strokes_lost_total: 10.2,
  trend: -0.05,
  trend_label: "declining",
  priority: 1.3,
  trainability: 0.85,
  goal_relevance: 1.15,
  recommended_action: "Build the block around centered contact.",
  evidence: [
    { source: "course", statement: "Losing 1.70 strokes per round.", value: 1.7, unit: "strokes/round", sample_size: 24 },
  ],
  related_skills: ["centered_contact", "distance_control", "face_control"],
};

const trend: PracticeMetricTrend = {
  skill: "centered_contact",
  drill_id: "drill_9_ball_contact",
  drill_name: "9-Ball Contact Drill",
  metric: "Solid-contact rate",
  unit: "%",
  points: [],
  latest: 0.61,
  baseline: 0.61,
  target: 0.75,
  delta: 0,
  meeting_target: false,
  sessions: 4,
};

describe("practiceDays", () => {
  it("spreads sessions across the week without repeats", () => {
    for (let n = 1; n <= 7; n++) {
      const days = practiceDays(n);
      assert.equal(new Set(days).size, days.length, `duplicates for ${n}`);
      assert.ok(days.every((d) => d >= 1 && d <= 7));
    }
    assert.equal(practiceDays(7).length, 7);
  });

  it("clamps nonsense input instead of producing an empty week", () => {
    assert.ok(practiceDays(0).length >= 1);
    assert.ok(practiceDays(99).length <= 7);
  });
});

describe("selectDrills", () => {
  it("never returns a drill needing a facility the player lacks", () => {
    const noShortGame = { ...profile, facilities: ["range" as const] };
    const drills = selectDrills(["chipping_proximity"], "technical", noShortGame, 5);
    assert.ok(drills.every((d) => d.category !== "chipping" && d.category !== "bunker"));
  });

  it("prefers drills that train the requested skill", () => {
    const drills = selectDrills(["centered_contact"], "technical", profile, 2);
    assert.ok(drills.length > 0);
    assert.equal(drills[0]?.skill_trained, "centered_contact");
  });
});

describe("buildPlanSkeleton", () => {
  const { plan, sessions } = buildPlanSkeleton({
    profile,
    weaknesses: [weakness],
    practiceTrends: [trend],
    startsOn: "2026-03-02",
  });

  it("covers every day of every week", () => {
    assert.equal(sessions.length, 14);
    assert.equal(plan.weeks, 2);
    assert.equal(plan.starts_on, "2026-03-02");
    assert.equal(plan.ends_on, "2026-03-15");
  });

  it("schedules exactly the requested number of practice days per week", () => {
    const week1 = sessions.filter((s) => s.week === 1 && !s.is_rest);
    assert.equal(week1.length, profile.practice_days_per_week);
  });

  it("only references drills that exist", () => {
    for (const session of sessions) {
      for (const id of session.drill_ids) {
        assert.ok(DRILLS_BY_ID.has(id), `unknown drill id ${id}`);
      }
    }
  });

  it("gives every practice session drills and a real duration", () => {
    for (const session of sessions.filter((s) => !s.is_rest)) {
      assert.ok(session.drill_ids.length >= 2, `${session.id} has ${session.drill_ids.length} drills`);
      assert.equal(session.duration, profile.typical_practice_duration);
      assert.ok(session.objective.length > 20);
    }
  });

  it("uses each drill at most once within a session", () => {
    for (const session of sessions) {
      assert.equal(new Set(session.drill_ids).size, session.drill_ids.length);
    }
  });

  it("progresses from technical toward pressure work", () => {
    const blocks = sessions.filter((s) => !s.is_rest).map((s) => s.block_emphasis);
    assert.equal(blocks[0], "technical");
    assert.equal(blocks[blocks.length - 1], "pressure");
  });

  it("sets a measurable target anchored on the player baseline", () => {
    const target = plan.targets.find((t) => t.skill === "centered_contact");
    assert.ok(target, "expected a contact target");
    assert.equal(target.baseline, 0.61);
    assert.ok(target.target > target.baseline, "target must be an improvement");
    assert.ok(target.target <= 0.75, "target must not exceed the drill standard");
  });

  it("still produces a usable plan with no weakness data", () => {
    const { plan: bare, sessions: bareSessions } = buildPlanSkeleton({
      profile,
      weaknesses: [],
      startsOn: "2026-03-02",
    });
    assert.ok(bare.title.length > 0);
    assert.match(bare.rationale, /Not enough round data/);
    assert.ok(bareSessions.filter((s) => !s.is_rest).every((s) => s.drill_ids.length >= 2));
  });
});

describe("evaluatePlanProgress", () => {
  const { plan, sessions } = buildPlanSkeleton({
    profile,
    weaknesses: [weakness],
    practiceTrends: [trend],
    startsOn: "2026-03-02",
  });
  const done = sessions.map((s) => (s.is_rest ? s : { ...s, status: "complete" as const }));

  it("calls a moved metric on track", () => {
    const progress = evaluatePlanProgress(plan, done, [{ ...trend, latest: 0.69 }]);
    assert.equal(progress.verdict, "on_track");
    assert.equal(progress.completion_rate, 1);
    assert.ok(progress.signals.length > 0);
  });

  it("calls a completed-but-unmoved block stalled", () => {
    const progress = evaluatePlanProgress(plan, done, [{ ...trend, latest: 0.61 }]);
    assert.equal(progress.verdict, "stalled");
    assert.match(progress.signals.join(" "), /regression drill/);
  });

  it("calls a reversed metric regressing", () => {
    const progress = evaluatePlanProgress(plan, done, [{ ...trend, latest: 0.55 }]);
    assert.equal(progress.verdict, "regressing");
  });

  it("calls a met target ahead", () => {
    const progress = evaluatePlanProgress(plan, done, [{ ...trend, latest: 0.78 }]);
    assert.equal(progress.verdict, "ahead");
    assert.match(progress.signals.join(" "), /random and pressure/);
  });

  it("does not claim progress when no practice data exists", () => {
    const progress = evaluatePlanProgress(plan, sessions, []);
    assert.equal(progress.completed, 0);
    assert.ok(progress.target_progress.every((t) => t.latest === null));
  });
});

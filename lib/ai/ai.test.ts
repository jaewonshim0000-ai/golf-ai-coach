import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { Weakness } from "../../types/analytics";
import type { PlayerProfile } from "../../types/player";
import type { SwingFinding, SwingSession } from "../../types/practice";
import { buildPlanSkeleton } from "../practice/plan-builder";
import { certaintyFor, ruleBasedInsight } from "./coaching";
import type { CoachingContext } from "./context";
import { ruleBasedRoundSummary, ruleBasedTrend } from "./insights";
import { materializePlan, ruleBasedAdaptation } from "./practice-plan";
import { RulesProvider, setProvider, getProvider } from "./provider";
import {
  coachingInsightSchema,
  practicePlanSchema,
  roundSummarySchema,
  swingAnalysisSchema,
} from "./schemas";
import { ruleBasedSwingAnalysis } from "./swing-analysis";

const context: CoachingContext = {
  playerProfile: {
    name: "Demo",
    handicap: 11.8,
    experience: "intermediate",
    hand: "right",
    typicalScore: 85,
    driverDistance: 255,
    swingPattern: "draw",
    commonMiss: "right",
    primaryGoal: "Improve approach play",
    secondaryGoals: ["Break 80"],
  },
  availability: { daysPerWeek: 4, minutesPerSession: 45, facilities: ["range"] },
  dataCoverage: {
    rounds: 6,
    shots: 480,
    practiceSessions: 8,
    drillAttempts: 20,
    swingSessions: 1,
    baseline: "PGA Tour average",
  },
  strokesGainedSummary: {
    perRound: -11.2,
    byCategory: [
      { category: "Off the Tee", perRound: 0.2, shots: 84 },
      { category: "Approach", perRound: -5.1, shots: 120 },
      { category: "Around the Green", perRound: -2.4, shots: 60 },
      { category: "Putting", perRound: -3.9, shots: 200 },
    ],
  },
  recentRounds: [{ date: "2026-08-01", course: "Test Links", score: 85, sgTotal: -11.2 }],
  distancePerformance: [],
  rankedWeaknesses: [],
  practiceSummary: {
    sessionsCompleted: 8,
    minutesLast14Days: 180,
    improving: [],
    stalled: [],
    declining: [],
    metrics: [],
  },
  swingFindings: [],
  activePlan: null,
  availableDrills: [],
  scoringTrend: [],
};

const weakness: Weakness = {
  id: "approach_distance:150-175",
  kind: "approach_distance",
  key: "150-175",
  title: "150–175 yd approach",
  category: "approach",
  severity: "significant",
  confidence: 0.84,
  sample_size: 24,
  sufficient_sample: true,
  strokes_lost_per_round: 1.7,
  strokes_lost_total: 10.2,
  trend: -0.06,
  trend_label: "declining",
  priority: 1.3,
  trainability: 0.85,
  goal_relevance: 1.15,
  recommended_action: "Build the block around centered contact, then test under random conditions.",
  evidence: [
    {
      source: "course",
      statement: "Losing 1.70 strokes per round from 150-175 yd approach across 24 shots in 6 rounds.",
      value: 1.7,
      unit: "strokes/round",
      sample_size: 24,
    },
    {
      source: "practice",
      statement: "9-Ball Contact Drill: Solid-contact rate is 61% against a 75% target across 4 sessions.",
      value: 0.61,
      unit: "%",
      sample_size: 4,
    },
    {
      source: "swing",
      statement: "Swing analysis flagged a likely transition issue: Inconsistent club delivery.",
      value: 0.82,
      unit: "confidence",
      sample_size: null,
    },
  ],
  related_skills: ["centered_contact", "distance_control", "face_control"],
};

describe("AI output schemas", () => {
  it("rejects an insight that is missing its primary priority", () => {
    const result = coachingInsightSchema.safeParse({
      headline: "Something is wrong here",
      secondary_priorities: [],
      cross_system_connection: "some text here",
      training_recommendation: "some text here",
      player_message: "some text here",
    });
    assert.equal(result.success, false);
  });

  it("rejects a confidence outside 0-1", () => {
    const result = coachingInsightSchema.safeParse({
      headline: "Your biggest area is approach play",
      primary_priority: {
        weakness_id: "x",
        title: "Approach",
        confidence: 4.2,
        certainty: "likely",
        strokes_lost_per_round: 1.7,
        reasoning: ["because"],
        evidence: [],
      },
      secondary_priorities: [],
      cross_system_connection: "some text here",
      training_recommendation: "some text here",
      player_message: "some text here",
    });
    assert.equal(result.success, false);
  });

  it("rejects an invented certainty level", () => {
    const result = coachingInsightSchema.safeParse({
      headline: "Your biggest area is approach play",
      primary_priority: {
        weakness_id: "x",
        title: "Approach",
        confidence: 0.8,
        certainty: "definitely",
        strokes_lost_per_round: 1.7,
        reasoning: ["because"],
        evidence: [],
      },
      secondary_priorities: [],
      cross_system_connection: "some text here",
      training_recommendation: "some text here",
      player_message: "some text here",
    });
    assert.equal(result.success, false);
  });

  it("rejects more than three swing priorities", () => {
    const priority = {
      rank: 1,
      category: "transition",
      issue: "Inconsistent delivery",
      certainty: "likely",
      confidence: 0.8,
      what_we_see: "the club is delivered inconsistently",
      why_it_matters: "it affects face and path relationships",
      drill_id: null,
      priority: "high",
    };
    const result = swingAnalysisSchema.safeParse({
      pattern_summary: "a draw pattern with a mid iron",
      priorities: [priority, priority, priority, priority],
      reference_note: "",
    });
    assert.equal(result.success, false);
  });

  it("rejects a plan with zero sessions", () => {
    const result = practicePlanSchema.safeParse({
      title: "Two week block",
      primary_goal: "Improve approach play",
      rationale: "Because the data says so",
      weeks: 2,
      targets: [{ metric: "Contact", skill: "centered_contact", baseline: 0.6, target: 0.7, unit: "%" }],
      sessions: [],
      progression_note: "technical then random",
    });
    assert.equal(result.success, false);
  });

  it("accepts a well-formed round summary", () => {
    const result = roundSummarySchema.safeParse({
      headline: "85 at Test Links",
      what_went_well: ["Driving held up"],
      what_cost_you: ["Approach play cost 5 strokes"],
      takeaway: "One round is a small sample, so treat this as a data point.",
    });
    assert.equal(result.success, true);
  });
});

describe("provider fallback", () => {
  it("returns the deterministic fallback and labels it as rules", async () => {
    setProvider(new RulesProvider());
    const provider = getProvider();
    const result = await provider.generate({
      name: "test",
      system: "s",
      prompt: "p",
      schema: roundSummarySchema,
      fallback: () => ({
        headline: "fallback headline",
        what_went_well: [],
        what_cost_you: [],
        takeaway: "this is the deterministic fallback",
      }),
    });
    assert.equal(result.source, "rules");
    assert.equal(result.model, null);
    assert.equal(result.data.headline, "fallback headline");
    setProvider(null);
  });
});

describe("ruleBasedInsight", () => {
  it("refuses to name a priority with no data", () => {
    const insight = ruleBasedInsight(
      { ...context, dataCoverage: { ...context.dataCoverage, rounds: 0, shots: 0 } },
      [],
    );
    assert.equal(coachingInsightSchema.safeParse(insight).success, true);
    assert.equal(insight.primary_priority.certainty, "uncertain");
    assert.equal(insight.primary_priority.strokes_lost_per_round, 0);
    assert.match(insight.player_message, /invent/);
  });

  it("produces a valid insight built from the supplied evidence only", () => {
    const insight = ruleBasedInsight(context, [weakness]);
    assert.equal(coachingInsightSchema.safeParse(insight).success, true);
    assert.equal(insight.primary_priority.weakness_id, weakness.id);
    assert.equal(insight.primary_priority.strokes_lost_per_round, 1.7);
    assert.equal(insight.primary_priority.evidence.length, 3);
    assert.match(insight.cross_system_connection, /three different ways/i);
  });

  it("hedges the language when the sample is thin", () => {
    const thin: Weakness = { ...weakness, sufficient_sample: false, sample_size: 4, confidence: 0.3 };
    const insight = ruleBasedInsight(context, [thin]);
    assert.match(insight.headline, /Early signal/);
    assert.equal(insight.primary_priority.certainty, "possible");
    assert.match(insight.player_message, /signal rather than a verdict/);
  });

  it("maps confidence onto the right certainty word", () => {
    assert.equal(certaintyFor({ ...weakness, confidence: 0.9 }), "observed");
    assert.equal(certaintyFor({ ...weakness, confidence: 0.7 }), "likely");
    assert.equal(certaintyFor({ ...weakness, confidence: 0.5 }), "possible");
    assert.equal(certaintyFor({ ...weakness, confidence: 0.2 }), "uncertain");
    assert.equal(certaintyFor({ ...weakness, confidence: 0.9, sufficient_sample: false }), "possible");
  });
});

describe("materializePlan", () => {
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
    secondary_goals: [],
    practice_days_per_week: 3,
    typical_practice_duration: 45,
    facilities: ["range", "putting_green", "short_game_area"],
    bag: ["driver", "7_iron", "sw", "putter"],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const skeleton = buildPlanSkeleton({ profile, weaknesses: [weakness], startsOn: "2026-03-02" });

  it("drops drill ids the model invented", () => {
    const output = {
      title: "Two week approach block",
      primary_goal: "Cut the approach losses",
      rationale: "Because the data says so",
      weeks: 2,
      targets: [{ metric: "Contact", skill: "centered_contact", baseline: 0.61, target: 0.7, unit: "%" }],
      sessions: skeleton.sessions.map((s) => ({
        week: s.week,
        day: s.day,
        title: s.title,
        objective: s.objective,
        block_emphasis: s.block_emphasis,
        duration: s.duration,
        drill_ids: s.is_rest ? [] : ["drill_that_does_not_exist", "drill_9_ball_contact"],
        is_rest: s.is_rest,
      })),
      progression_note: "technical then random",
    };
    const { sessions } = materializePlan(output, skeleton, "ai");
    for (const session of sessions.filter((s) => !s.is_rest)) {
      assert.deepEqual(session.drill_ids, ["drill_9_ball_contact"]);
    }
  });

  it("keeps the skeleton drills when the model supplies none that exist", () => {
    const output = {
      title: "Block",
      primary_goal: "Cut the approach losses",
      rationale: "Because the data says so",
      weeks: 2,
      targets: [{ metric: "Contact", skill: "centered_contact", baseline: 0.61, target: 0.7, unit: "%" }],
      sessions: skeleton.sessions.map((s) => ({
        week: s.week,
        day: s.day,
        title: s.title,
        objective: s.objective,
        block_emphasis: s.block_emphasis,
        duration: s.duration,
        drill_ids: s.is_rest ? [] : ["nope"],
        is_rest: s.is_rest,
      })),
      progression_note: "technical then random",
    };
    const { sessions } = materializePlan(output, skeleton, "ai");
    const first = sessions.find((s) => !s.is_rest)!;
    const baseline = skeleton.sessions.find((s) => s.id === first.id)!;
    assert.deepEqual(first.drill_ids, baseline.drill_ids);
  });

  it("discards a target whose skill is not a real skill", () => {
    const output = {
      title: "Block",
      primary_goal: "Cut the approach losses",
      rationale: "Because the data says so",
      weeks: 2,
      targets: [{ metric: "Vibes", skill: "vibes", baseline: 0, target: 1, unit: "%" }],
      sessions: skeleton.sessions.map((s) => ({
        week: s.week,
        day: s.day,
        title: s.title,
        objective: s.objective,
        block_emphasis: s.block_emphasis,
        duration: s.duration,
        drill_ids: s.drill_ids,
        is_rest: s.is_rest,
      })),
      progression_note: "technical then random",
    };
    const { plan } = materializePlan(output, skeleton, "ai");
    assert.deepEqual(plan.targets, skeleton.plan.targets);
  });
});

describe("rule-based narration", () => {
  it("does not invent a round summary from an empty round", () => {
    const summary = ruleBasedRoundSummary(
      {
        round_id: "r1",
        course_name: "Test",
        played_on: "2026-01-01",
        score: null,
        to_par: null,
        holes_played: 0,
        sg_total: 0,
        sg_by_category: { off_the_tee: 0, approach: 0, around_the_green: 0, putting: 0 },
        fairways_hit: 0,
        fairway_opportunities: 0,
        greens_in_regulation: 0,
        putts: 0,
        penalties: 0,
        up_and_downs: 0,
        up_and_down_opportunities: 0,
        sand_saves: 0,
        sand_save_opportunities: 0,
        best_hole: null,
        worst_hole: null,
      },
      [],
    );
    assert.match(summary.headline, /No shots recorded/);
    assert.equal(summary.what_went_well.length, 0);
  });

  it("calls a two-point trend insufficient rather than guessing", () => {
    const trend = ruleBasedTrend(
      "Scoring",
      [
        { date: "2026-01-01", label: "a", value: 88 },
        { date: "2026-01-08", label: "b", value: 84 },
      ],
      "strokes",
    );
    assert.equal(trend.direction, "insufficient_data");
  });

  it("names a verdict-appropriate adaptation", () => {
    const adaptation = ruleBasedAdaptation(
      {
        verdict: "stalled",
        completed: 6,
        scheduled: 8,
        completion_rate: 0.75,
        target_progress: [{ metric: "Contact", baseline: 0.61, target: 0.73, latest: 0.61, progress: 0 }],
        signals: [],
      },
      {
        id: "plan1",
        user_id: "u1",
        title: "Block",
        primary_goal: "goal",
        rationale: "r",
        weeks: 2,
        starts_on: "2026-03-02",
        ends_on: "2026-03-15",
        status: "active",
        targets: [{ metric: "Contact", skill: "centered_contact", baseline: 0.61, target: 0.73, unit: "%" }],
        generated_by: "rules",
        source_snapshot: null,
        created_at: "2026-03-02T00:00:00.000Z",
      },
    );
    assert.equal(adaptation.verdict, "stalled");
    assert.match(adaptation.changes.join(" "), /regression drill/);
  });

  it("caps swing priorities at three and never claims a measurement it does not have", () => {
    const session: SwingSession = {
      id: "sw1",
      user_id: "u1",
      video_url: null,
      camera_angle: "down_the_line",
      club: "7_iron",
      shot_type: "full",
      swing_pattern: "draw",
      notes: null,
      analysis_status: "manual",
      created_at: "2026-03-01T00:00:00.000Z",
    };
    const finding = (i: number): SwingFinding => ({
      id: `f${i}`,
      swing_session_id: "sw1",
      user_id: "u1",
      category: "transition",
      issue: `Issue ${i}`,
      severity: "high",
      confidence: 0.8,
      certainty: "likely",
      description: "Something observed in the video",
      why_it_matters: "It affects face and path",
      recommended_drill_id: null,
      related_skill: "sequencing",
      source: "manual",
      created_at: "2026-03-01T00:00:00.000Z",
    });
    const analysis = ruleBasedSwingAnalysis(session, [1, 2, 3, 4, 5].map(finding), []);
    assert.equal(swingAnalysisSchema.safeParse(analysis).success, true);
    assert.equal(analysis.priorities.length, 3);
    assert.match(analysis.pattern_summary, /not measurements/);
    assert.ok(analysis.priorities.every((p) => p.drill_id === "drill_pause_at_top"));
  });
});

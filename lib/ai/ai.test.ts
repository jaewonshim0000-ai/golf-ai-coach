import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { Segment, Weakness } from "../../types/analytics";
import type { Round } from "../../types/rounds";
import type { PlayerState } from "../player-state";
import { askCoach, buildAskIndex, ruleBasedAnswer, searchIndex } from "./ask";
import type { PlayerProfile } from "../../types/player";
import type { SwingFinding, SwingSession } from "../../types/practice";
import { certaintyFor, ruleBasedInsight } from "./coaching";
import type { CoachingContext } from "./context";
import { ruleBasedRoundSummary, ruleBasedTrend } from "./insights";
import { RulesProvider, setProvider, getProvider } from "./provider";
import { coachingInsightSchema, roundSummarySchema, swingAnalysisSchema } from "./schemas";
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

// ------------------------------------------------------------- ask agent

function askState(): PlayerState {
  const round: Round = {
    id: "r1",
    user_id: "u1",
    course_id: "c1",
    course_name: "Riverbend Golf Club",
    played_on: "2026-09-12",
    tees: "white",
    holes_played: 18,
    score: 84,
    conditions: [],
    notes: null,
    status: "complete",
    created_at: "2026-09-12T00:00:00.000Z",
  };
  const segment: Segment = {
    kind: "putt_distance",
    key: "10-20",
    label: "Putts 10–20 ft",
    category: "putting",
    shots: 52,
    rounds: 8,
    total_sg: -0.8,
    sg_per_shot: -0.015,
    sg_per_round: -0.1,
    trend: null,
    volatility: 0.4,
  };
  const band: Segment = {
    ...segment,
    kind: "approach_distance",
    key: "150-175",
    label: "150–175 yd approach",
    category: "approach",
    shots: 44,
    sg_per_round: -2.36,
  };
  const far: Segment = { ...band, key: "225+", label: "225+ yd approach", shots: 9 };

  return {
    userId: "u1",
    profile: null,
    drills: [],
    rounds: [round],
    shots: [],
    shotsByRound: new Map(),
    summary: {
      total: 0,
      per_round: 0,
      rounds: 1,
      shots: 0,
      by_category: {
        off_the_tee: { category: "off_the_tee", total: 0, per_round: 0, shots: 0 },
        approach: { category: "approach", total: 0, per_round: 0, shots: 0 },
        around_the_green: { category: "around_the_green", total: 0, per_round: 0, shots: 0 },
        putting: { category: "putting", total: 0, per_round: 0, shots: 0 },
      },
    },
    segments: [segment, band, far],
    weaknesses: [],
    practiceSessions: [],
    drillAttempts: [],
    practiceTrends: [],
    improvement: { improving: [], flat: [], declining: [], insufficient: [] },
    volume: {
      sessions_completed: 0,
      sessions_planned: 0,
      total_minutes: 0,
      last_14_days: 0,
      streak_weeks: 0,
      by_week: [],
    },
    swingSessions: [],
    swingFindings: [],
    swingMeasurements: [],
    handicapHistory: [],
    sgTrend: [],
    scoringTrend: [],
    session: null,
    context: null,
    hasData: true,
  };
}

describe("ask agent", () => {
  it("indexes every screen even with no data at all", () => {
    const empty = { ...askState(), rounds: [], segments: [] };
    const index = buildAskIndex(empty);
    assert.ok(index.every((entry) => entry.kind === "screen"));
    assert.ok(index.some((entry) => entry.href === "/train"));
  });

  it("matches a question to a segment across word endings", () => {
    // "putting" has to reach a label that says "Putts".
    const hits = searchIndex("how is my putting", buildAskIndex(askState()));
    assert.equal(hits[0]?.title, "Putts 10–20 ft");
  });

  it("matches a bare yardage to its distance band", () => {
    const hits = searchIndex("150 yards", buildAskIndex(askState()));
    assert.equal(hits[0]?.title, "150–175 yd approach");
  });

  it("returns nothing for a question with no searchable words", () => {
    assert.deepEqual(searchIndex("what is it", buildAskIndex(askState())), []);
  });

  it("links a segment to filters the rounds page can parse", () => {
    const index = buildAskIndex(askState());
    const band = index.find((entry) => entry.id === "segment:approach_distance:150-175");
    assert.equal(band?.href, "/rounds?category=approach&distance=150-175");

    // "225+" is not a min-max range; it must not reach the URL as one.
    const open = index.find((entry) => entry.id === "segment:approach_distance:225+");
    const distance = new URL(open!.href, "http://x").searchParams.get("distance")!;
    assert.ok(distance.split("-").every((part) => Number.isFinite(Number(part))));
  });

  it("drops result ids the model invented rather than rendering dead links", async () => {
    setProvider({
      id: "stub",
      model: "stub",
      async generate() {
        return {
          data: {
            answer: "Try this.",
            result_ids: ["segment:club:driver", "screen:billing"],
            follow_up: [],
          },
          source: "ai" as const,
          model: "stub",
        };
      },
    } as never);

    const result = await askCoach("putting", askState());
    setProvider(null);

    assert.ok(result.results.length > 0);
    // Neither invented id exists in this state, so the deterministic hits stand.
    assert.ok(result.results.every((entry) => entry.id.startsWith("segment:putt_distance")));
  });

  it("never answers without a real entry behind it", () => {
    const hits = searchIndex("putting", buildAskIndex(askState()));
    const answer = ruleBasedAnswer("putting", hits);
    assert.match(answer, /Putts 10–20 ft/);
    assert.match(answer, /52 shots/);
  });
});

describe("ask agent ranking", () => {
  it("does not let a word that is in every label decide the result", () => {
    // "shots" appears in most entries; "150" appears in one.
    const hits = searchIndex("how are my 150 shots", buildAskIndex(askState()));
    assert.equal(hits[0]?.title, "150–175 yd approach");
  });

  it("answers a superlative from the ranked weaknesses, worst first", () => {
    const state = askState();
    state.weaknesses = [
      askWeakness("lie", "greenside_bunker", "Greenside bunker", 0.42),
      askWeakness("approach_distance", "150-175", "150–175 yd approach", 2.36),
    ];
    const hits = searchIndex("where am I losing the most shots", buildAskIndex(state));
    assert.equal(hits[0]?.title, "150–175 yd approach");
    assert.equal(hits[1]?.title, "Greenside bunker");
  });

  it("returns the drill when the question asks for a drill", () => {
    const state = askState();
    state.weaknesses = [askWeakness("lie", "greenside_bunker", "Greenside bunker", 0.55)];
    state.drills = [
      {
        id: "d_bunker",
        name: "Bunker Entry Line",
        category: "bunker",
        sub_category: null,
        description: "Draw a line and enter the sand on it",
        instructions: ["Draw a line", "Enter on it"],
        skill_trained: "bunker_technique",
        difficulty: "beginner",
        recommended_duration: 12,
        recommended_reps: 20,
        equipment_required: [],
        clubs: ["sw"],
        metric_to_track: "Entries on the line",
        metric_unit: "percent",
        scoring_method: "percentage",
        success_threshold: 0.6,
        progression_level: null,
        regression_level: null,
      },
    ];
    const hits = searchIndex("find a bunker drill", buildAskIndex(state));
    assert.equal(hits[0]?.title, "Bunker Entry Line");
  });

  it("keeps a superlative on topic when the question names one", () => {
    const state = askState();
    state.weaknesses = [
      askWeakness("approach_distance", "150-175", "150–175 yd approach", 2.36),
      askWeakness("putt_distance", "3-6", "Putts 3–6 ft", 0.9),
    ];
    // The approach weakness costs more, but the question is about putting.
    const hits = searchIndex("what should I improve about my putting", buildAskIndex(state));
    assert.equal(hits[0]?.title, "Putts 3–6 ft");
  });
});

function askWeakness(
  kind: Weakness["kind"],
  key: string,
  title: string,
  lost: number,
): Weakness {
  return {
    id: `${kind}:${key}`,
    kind,
    key,
    title,
    category: "approach",
    severity: "significant",
    confidence: 0.8,
    sample_size: 40,
    sufficient_sample: true,
    strokes_lost_per_round: lost,
    strokes_lost_total: lost * 8,
    trend: null,
    trend_label: "flat",
    priority: lost,
    trainability: 0.8,
    goal_relevance: 1,
    recommended_action: "Work on it",
    evidence: [],
    related_skills: [],
  };
}

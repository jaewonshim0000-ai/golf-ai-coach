import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { DISTANCE_BANDS, PUTT_BANDS, bandStart, distanceBand, puttBand } from "../../types/golf";
import type { PlayerProfile } from "../../types/player";
import type { Drill, DrillAttempt, PracticeSession } from "../../types/practice";
import type { ScoredShot } from "../../types/rounds";
import { buildSegments, summarizeStrokesGained } from "./aggregate";
import { improvementSummary, practiceTrends, practiceVolume } from "./practice-progress";
import { MIN_SAMPLE, identifyWeaknesses } from "./weaknesses";

let n = 0;
function scored(partial: Partial<ScoredShot>): ScoredShot {
  n += 1;
  return {
    id: `s${n}`,
    round_id: "r1",
    user_id: "u1",
    hole_number: 1,
    hole_par: 4,
    shot_number: 2,
    starting_location: "fairway",
    starting_distance: 160,
    starting_unit: "yards",
    lie: "fairway",
    club: "7_iron",
    shot_type: "approach",
    intended_target: null,
    ending_location: "green",
    ending_distance: 30,
    ending_unit: "feet",
    penalty_strokes: 0,
    penalty_type: "none",
    miss_direction: null,
    notes: null,
    created_at: `2026-01-${String((n % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
    expected_before: 2.98,
    expected_after: 2.0,
    strokes_gained: -0.4,
    sg_category: "approach",
    ...partial,
  };
}

const profile: PlayerProfile = {
  id: "p1",
  user_id: "u1",
  display_name: "Test",
  handicap_index: 11.8,
  experience_level: "intermediate",
  dominant_hand: "right",
  typical_score: 85,
  average_driver_distance: 255,
  swing_pattern: "draw",
  common_miss: "right",
  primary_goal: "improve_approach",
  secondary_goals: ["break_80"],
  practice_days_per_week: 3,
  typical_practice_duration: 60,
  facilities: ["range", "putting_green"],
  bag: ["driver", "7_iron", "putter"],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("distance grouping", () => {
  it("puts boundary values in the upper band", () => {
    assert.equal(distanceBand(150).id, "150-175");
    assert.equal(distanceBand(149.9).id, "125-150");
    assert.equal(distanceBand(175).id, "175-200");
    assert.equal(distanceBand(400).id, "225+");
    assert.equal(distanceBand(0).id, "0-50");
  });

  it("buckets putts by feet", () => {
    assert.equal(puttBand(2).id, "0-3");
    assert.equal(puttBand(3).id, "3-6");
    assert.equal(puttBand(45).id, "30+");
  });

  it("orders every band id, including the open-ended one", () => {
    // Number("225+") is NaN, which sorts bands into a meaningless order
    // without throwing. Both band families must survive an ordinary sort.
    for (const bands of [DISTANCE_BANDS, PUTT_BANDS]) {
      const ids = bands.map((b) => b.id);
      const shuffled = [...ids].reverse();
      const sorted = shuffled.sort((a, b) => bandStart(a) - bandStart(b));
      assert.deepEqual(sorted, ids, `bands out of order: ${sorted.join(", ")}`);
      assert.ok(
        ids.every((id) => Number.isFinite(bandStart(id))),
        "every band id must yield a finite lower bound",
      );
    }
  });
});

describe("summarizeStrokesGained", () => {
  it("returns a zeroed summary rather than NaN when there is no data", () => {
    const summary = summarizeStrokesGained([]);
    assert.equal(summary.total, 0);
    assert.equal(summary.per_round, 0);
    assert.equal(summary.by_category.approach.total, 0);
  });

  it("divides by distinct rounds, not by shots", () => {
    const shots = [
      scored({ round_id: "r1", strokes_gained: -1 }),
      scored({ round_id: "r2", strokes_gained: -1 }),
    ];
    const summary = summarizeStrokesGained(shots);
    assert.equal(summary.rounds, 2);
    assert.equal(summary.total, -2);
    assert.equal(summary.per_round, -1);
  });
});

describe("buildSegments", () => {
  const shots = [
    ...Array.from({ length: 14 }, (_, i) =>
      scored({
        round_id: `r${i % 4}`,
        starting_distance: 160,
        strokes_gained: -0.45,
        created_at: `2026-02-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
      }),
    ),
    ...Array.from({ length: 10 }, () =>
      scored({ round_id: "r1", starting_distance: 110, strokes_gained: 0.05 }),
    ),
  ];

  it("creates a segment per approach distance band", () => {
    const segments = buildSegments(shots);
    const band = segments.find((s) => s.kind === "approach_distance" && s.key === "150-175");
    assert.ok(band, "expected a 150-175 segment");
    assert.equal(band.shots, 14);
    assert.ok(band.sg_per_shot < 0);
  });

  it("spreads per-round loss across every round in the dataset", () => {
    const segments = buildSegments(shots);
    const band = segments.find((s) => s.kind === "approach_distance" && s.key === "150-175")!;
    // 14 shots x -0.45 = -6.3 across 4 distinct rounds.
    assert.ok(Math.abs(band.sg_per_round + 1.58) < 0.05, `got ${band.sg_per_round}`);
  });

  it("leaves trend null below the minimum trend sample", () => {
    const segments = buildSegments([scored({}), scored({}), scored({})]);
    const band = segments.find((s) => s.kind === "approach_distance");
    assert.equal(band?.trend, null);
  });
});

describe("identifyWeaknesses", () => {
  function approachShots(count: number, sg: number, distance = 160) {
    return Array.from({ length: count }, (_, i) =>
      scored({
        round_id: `r${i % 5}`,
        starting_distance: distance,
        strokes_gained: sg,
        created_at: `2026-03-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
      }),
    );
  }

  it("does not call a 3-shot sample a weakness", () => {
    const weaknesses = identifyWeaknesses({
      segments: buildSegments(approachShots(3, -1.2)),
      profile,
      totalRounds: 3,
      practiceTrends: [],
      swingFindings: [],
    });
    const band = weaknesses.find((w) => w.kind === "approach_distance");
    assert.ok(band);
    assert.equal(band.sufficient_sample, false);
    assert.equal(band.severity, "watch");
    assert.match(band.evidence[0]!.statement, /Early signal/);
    assert.match(band.recommended_action, new RegExp(String(MIN_SAMPLE.approach_distance)));
  });

  it("ranks a large consistent loss above a small one", () => {
    const shots = [...approachShots(20, -0.5, 160), ...approachShots(20, -0.08, 185)];
    const weaknesses = identifyWeaknesses({
      segments: buildSegments(shots),
      profile,
      totalRounds: 5,
      practiceTrends: [],
      swingFindings: [],
    });
    const bands = weaknesses.filter((w) => w.kind === "approach_distance");
    assert.equal(bands[0]?.key, "150-175");
    assert.ok(bands[0]!.priority > (bands[1]?.priority ?? 0));
  });

  it("ignores segments the player is gaining strokes in", () => {
    const weaknesses = identifyWeaknesses({
      segments: buildSegments(approachShots(20, 0.3)),
      profile,
      totalRounds: 5,
      practiceTrends: [],
      swingFindings: [],
    });
    assert.equal(weaknesses.filter((w) => w.kind === "approach_distance").length, 0);
  });

  it("raises confidence when practice and swing data corroborate", () => {
    const segments = buildSegments(approachShots(20, -0.5));
    const bare = identifyWeaknesses({ segments, profile, totalRounds: 5 });
    const corroborated = identifyWeaknesses({
      segments,
      profile,
      totalRounds: 5,
      practiceTrends: [
        {
          skill: "centered_contact",
          drill_id: "d1",
          drill_name: "9-Ball Contact Drill",
          metric: "Solid-contact rate",
          unit: "%",
          points: [],
          latest: 0.61,
          baseline: 0.6,
          target: 0.75,
          delta: 0.01,
          meeting_target: false,
          sessions: 4,
        },
      ],
      swingFindings: [
        {
          id: "f1",
          swing_session_id: "sw1",
          user_id: "u1",
          category: "transition",
          issue: "Inconsistent club delivery",
          severity: "high",
          confidence: 0.82,
          certainty: "likely",
          description: "",
          why_it_matters: "",
          recommended_drill_id: null,
          related_skill: "centered_contact",
          source: "manual",
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    });
    const before = bare.find((w) => w.kind === "approach_distance")!;
    const after = corroborated.find((w) => w.kind === "approach_distance")!;
    assert.ok(after.confidence > before.confidence);
    assert.equal(after.evidence.length, 3, "course + practice + swing");
    assert.ok(after.evidence.some((e) => e.source === "practice"));
    assert.ok(after.evidence.some((e) => e.source === "swing"));
  });

  it("never claims more than 95% confidence", () => {
    const weaknesses = identifyWeaknesses({
      segments: buildSegments(approachShots(400, -0.5)),
      profile,
      totalRounds: 40,
    });
    for (const w of weaknesses) assert.ok(w.confidence <= 0.95);
  });
});

describe("practice trends", () => {
  const drill: Drill = {
    id: "d1",
    name: "9-Ball Contact Drill",
    category: "contact",
    sub_category: "mid irons",
    description: "",
    instructions: [],
    skill_trained: "centered_contact",
    difficulty: "intermediate",
    recommended_duration: 15,
    recommended_reps: 27,
    equipment_required: [],
    clubs: ["7_iron"],
    metric_to_track: "Solid-contact rate",
    metric_unit: "%",
    scoring_method: "ratio",
    success_threshold: 0.75,
    progression_level: null,
    regression_level: null,
  };

  function attempt(date: string, score: number): DrillAttempt {
    return {
      id: `a${date}`,
      user_id: "u1",
      session_id: `s${date}`,
      practice_item_id: null,
      drill_id: "d1",
      attempts: 27,
      successes: Math.round(score * 27),
      score,
      raw_value: null,
      notes: null,
      completed_at: `${date}T12:00:00.000Z`,
    };
  }

  it("measures improvement against an early baseline, not the first point alone", () => {
    const trends = practiceTrends(
      [
        attempt("2026-01-01", 0.6),
        attempt("2026-01-04", 0.62),
        attempt("2026-01-08", 0.68),
        attempt("2026-01-12", 0.75),
      ],
      [drill],
    );
    const trend = trends[0]!;
    assert.equal(trend.baseline, 0.61);
    assert.equal(trend.latest, 0.75);
    assert.equal(trend.delta, 0.14);
    assert.equal(trend.meeting_target, true);
  });

  it("classifies a stalled drill as declining, not improving", () => {
    const trends = practiceTrends(
      [attempt("2026-01-01", 0.61), attempt("2026-01-05", 0.6), attempt("2026-01-09", 0.55)],
      [drill],
    );
    const summary = improvementSummary(trends);
    assert.equal(summary.declining.length, 1);
    assert.equal(summary.improving.length, 0);
  });

  it("will not classify a drill with fewer than 3 sessions", () => {
    const summary = improvementSummary(practiceTrends([attempt("2026-01-01", 0.61)], [drill]));
    assert.equal(summary.insufficient.length, 1);
  });

  it("drops attempts whose drill is missing rather than inventing one", () => {
    assert.equal(practiceTrends([attempt("2026-01-01", 0.6)], []).length, 0);
  });
});

describe("practiceVolume", () => {
  function session(date: string, status: PracticeSession["status"]): PracticeSession {
    return {
      id: `s${date}`,
      user_id: "u1",
      plan_session_id: null,
      title: "Session",
      location: null,
      focus: "contact",
      planned_duration: 45,
      actual_duration: status === "complete" ? 50 : null,
      energy_level: null,
      status,
      scheduled_for: date,
      completed_at: status === "complete" ? `${date}T12:00:00.000Z` : null,
      reflection: null,
      created_at: `${date}T00:00:00.000Z`,
    };
  }

  it("counts only completed sessions toward minutes", () => {
    const volume = practiceVolume(
      [session("2026-03-01", "complete"), session("2026-03-03", "planned")],
      new Date("2026-03-05T00:00:00.000Z"),
    );
    assert.equal(volume.sessions_completed, 1);
    assert.equal(volume.sessions_planned, 2);
    assert.equal(volume.total_minutes, 50);
    assert.equal(volume.last_14_days, 1);
  });
});

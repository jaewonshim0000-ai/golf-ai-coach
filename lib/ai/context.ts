import type { PracticeMetricTrend, SGSummary, TrendPoint, Weakness } from "../../types/analytics";
import type { PlayerProfile } from "../../types/player";
import type { Round, ScoredShot } from "../../types/rounds";
import type { Drill, PracticeSession, SwingFinding, SwingSession } from "../../types/practice";
import { GOAL_LABELS } from "../../types/player";
import { SG_CATEGORIES, SG_CATEGORY_LABELS } from "../../types/golf";
import { summarizeStrokesGained } from "../analytics/aggregate";
import { improvementSummary, practiceVolume } from "../analytics/practice-progress";
import { MIN_SAMPLE } from "../analytics/weaknesses";
import { BASELINE_NAME } from "../golf/expected-strokes";

/**
 * The AI never sees the database. It sees this: a small, already-computed
 * summary of the player. Every number here was produced by deterministic code.
 */
export type CoachingContext = {
  playerProfile: {
    name: string;
    handicap: number | null;
    experience: string;
    hand: string;
    typicalScore: number | null;
    driverDistance: number | null;
    swingPattern: string;
    commonMiss: string | null;
    primaryGoal: string;
    secondaryGoals: string[];
  };
  availability: {
    daysPerWeek: number;
    minutesPerSession: number;
    facilities: string[];
  };
  dataCoverage: {
    rounds: number;
    shots: number;
    practiceSessions: number;
    drillAttempts: number;
    swingSessions: number;
    baseline: string;
  };
  strokesGainedSummary: {
    perRound: number;
    byCategory: { category: string; perRound: number; shots: number }[];
  };
  recentRounds: {
    date: string;
    course: string;
    score: number | null;
    sgTotal: number;
  }[];
  distancePerformance: {
    band: string;
    shots: number;
    sgPerRound: number;
    sufficientSample: boolean;
  }[];
  rankedWeaknesses: {
    id: string;
    title: string;
    category: string;
    severity: string;
    confidence: number;
    sampleSize: number;
    sufficientSample: boolean;
    strokesLostPerRound: number;
    trend: string;
    priority: number;
    evidence: string[];
  }[];
  practiceSummary: {
    sessionsCompleted: number;
    minutesLast14Days: number;
    improving: string[];
    stalled: string[];
    declining: string[];
    metrics: {
      drill: string;
      metric: string;
      latest: number | null;
      baseline: number | null;
      target: number;
      sessions: number;
      meetingTarget: boolean;
    }[];
  };
  swingFindings: {
    date: string;
    club: string;
    pattern: string;
    category: string;
    issue: string;
    certainty: string;
    confidence: number;
  }[];
  availableDrills: { id: string; name: string; skill: string; category: string; minutes: number }[];
  scoringTrend: TrendPoint[];
};

export type ContextInput = {
  profile: PlayerProfile;
  rounds: Round[];
  shots: ScoredShot[];
  weaknesses: Weakness[];
  practiceSessions: PracticeSession[];
  practiceTrends: PracticeMetricTrend[];
  drillAttemptCount: number;
  swingSessions: SwingSession[];
  swingFindings: SwingFinding[];
  drills: Drill[];
  scoringTrend?: TrendPoint[];
  now?: Date;
};

export function buildCoachingContext(input: ContextInput): CoachingContext {
  const sg: SGSummary = summarizeStrokesGained(input.shots);
  const improvement = improvementSummary(input.practiceTrends);
  const volume = practiceVolume(input.practiceSessions, input.now ?? new Date());

  const sessionById = new Map(input.swingSessions.map((s) => [s.id, s]));

  return {
    playerProfile: {
      name: input.profile.display_name,
      handicap: input.profile.handicap_index,
      experience: input.profile.experience_level,
      hand: input.profile.dominant_hand,
      typicalScore: input.profile.typical_score,
      driverDistance: input.profile.average_driver_distance,
      swingPattern: input.profile.swing_pattern,
      commonMiss: input.profile.common_miss,
      primaryGoal: GOAL_LABELS[input.profile.primary_goal],
      secondaryGoals: input.profile.secondary_goals.map((g) => GOAL_LABELS[g]),
    },
    availability: {
      daysPerWeek: input.profile.practice_days_per_week,
      minutesPerSession: input.profile.typical_practice_duration,
      facilities: input.profile.facilities,
    },
    dataCoverage: {
      rounds: input.rounds.length,
      shots: input.shots.length,
      practiceSessions: input.practiceSessions.filter((s) => s.status === "complete").length,
      drillAttempts: input.drillAttemptCount,
      swingSessions: input.swingSessions.length,
      baseline: BASELINE_NAME,
    },
    strokesGainedSummary: {
      perRound: sg.per_round,
      byCategory: SG_CATEGORIES.map((c) => ({
        category: SG_CATEGORY_LABELS[c],
        perRound: sg.by_category[c].per_round,
        shots: sg.by_category[c].shots,
      })),
    },
    recentRounds: [...input.rounds]
      .sort((a, b) => b.played_on.localeCompare(a.played_on))
      .slice(0, 6)
      .map((r) => ({
        date: r.played_on,
        course: r.course_name,
        score: r.score,
        sgTotal:
          Math.round(
            input.shots
              .filter((s) => s.round_id === r.id)
              .reduce((sum, s) => sum + s.strokes_gained, 0) * 100,
          ) / 100,
      })),
    distancePerformance: input.weaknesses
      .filter((w) => w.kind === "approach_distance")
      .map((w) => ({
        band: w.title,
        shots: w.sample_size,
        sgPerRound: -w.strokes_lost_per_round,
        sufficientSample: w.sufficient_sample,
      })),
    rankedWeaknesses: input.weaknesses.slice(0, 8).map((w) => ({
      id: w.id,
      title: w.title,
      category: w.category,
      severity: w.severity,
      confidence: w.confidence,
      sampleSize: w.sample_size,
      sufficientSample: w.sufficient_sample,
      strokesLostPerRound: w.strokes_lost_per_round,
      trend: w.trend_label,
      priority: w.priority,
      evidence: w.evidence.map((e) => e.statement),
    })),
    practiceSummary: {
      sessionsCompleted: volume.sessions_completed,
      minutesLast14Days: volume.last_14_days * input.profile.typical_practice_duration,
      improving: improvement.improving.map((t) => t.drill_name),
      stalled: improvement.flat.map((t) => t.drill_name),
      declining: improvement.declining.map((t) => t.drill_name),
      metrics: input.practiceTrends.slice(0, 8).map((t) => ({
        drill: t.drill_name,
        metric: t.metric,
        latest: t.latest,
        baseline: t.baseline,
        target: t.target,
        sessions: t.sessions,
        meetingTarget: t.meeting_target,
      })),
    },
    swingFindings: input.swingFindings.slice(0, 8).map((f) => {
      const session = sessionById.get(f.swing_session_id);
      return {
        date: f.created_at.slice(0, 10),
        club: session?.club ?? "unknown",
        pattern: session?.swing_pattern ?? "unknown",
        category: f.category,
        issue: f.issue,
        certainty: f.certainty,
        confidence: f.confidence,
      };
    }),
    availableDrills: input.drills.map((d) => ({
      id: d.id,
      name: d.name,
      skill: d.skill_trained,
      category: d.category,
      minutes: d.recommended_duration,
    })),
    scoringTrend: input.scoringTrend ?? [],
  };
}


/** Compact prompt rendering. JSON keeps the model honest about which field is which. */
export function renderContext(context: CoachingContext): string {
  return JSON.stringify(context, null, 1);
}

/** The caveats the model is required to respect, stated explicitly. */
export function sampleSizeNotes(weaknesses: Weakness[]): string[] {
  return weaknesses
    .filter((w) => !w.sufficient_sample)
    .map(
      (w) =>
        `${w.title}: only ${w.sample_size} shots recorded (${MIN_SAMPLE[w.kind]} needed). Treat as an early signal, not a confirmed weakness.`,
    );
}

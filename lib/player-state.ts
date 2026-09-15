import type { PracticeMetricTrend, Segment, SGSummary, TrendPoint, Weakness } from "./../types/analytics";
import type { HandicapEntry, PlayerProfile } from "./../types/player";
import type { Round, ScoredShot } from "./../types/rounds";
import type {
  Drill,
  DrillAttempt,
  PracticeSession,
  SwingFinding,
  SwingSession,
} from "./../types/practice";
import { buildSegments, scoringTrend, sgTrend, summarizeStrokesGained } from "./analytics/aggregate";
import { improvementSummary, practiceTrends, practiceVolume, type ImprovementSummary, type PracticeVolume } from "./analytics/practice-progress";
import { identifyWeaknesses } from "./analytics/weaknesses";
import { scoreShots } from "./golf/strokes-gained";
import { evaluatePlanProgress, type PlanProgress } from "./practice/plan-builder";
import { buildCoachingContext, type CoachingContext } from "./ai/context";
import * as repo from "./db/repo";

/**
 * The player's whole game, assembled once.
 *
 * Every screen needs some slice of "who is this golfer and where are they
 * losing shots", and every slice has to agree with every other one. Building it
 * in one place is what makes the app a single system rather than three tools.
 */
export type PlayerState = {
  userId: string;
  profile: PlayerProfile | null;
  drills: Drill[];
  rounds: Round[];
  shots: ScoredShot[];
  shotsByRound: Map<string, ScoredShot[]>;
  summary: SGSummary;
  segments: Segment[];
  weaknesses: Weakness[];
  practiceSessions: PracticeSession[];
  drillAttempts: DrillAttempt[];
  practiceTrends: PracticeMetricTrend[];
  improvement: ImprovementSummary;
  volume: PracticeVolume;
  swingSessions: SwingSession[];
  swingFindings: SwingFinding[];
  handicapHistory: HandicapEntry[];
  plan: repo.PlanBundle | null;
  planProgress: PlanProgress | null;
  sgTrend: TrendPoint[];
  scoringTrend: TrendPoint[];
  context: CoachingContext | null;
  hasData: boolean;
};

export async function loadPlayerState(userId: string): Promise<PlayerState> {
  const [
    profile,
    rounds,
    rawShots,
    practiceSessions,
    drillAttempts,
    swingSessions,
    swingFindings,
    handicapHistory,
    plan,
  ] = await Promise.all([
    repo.getProfile(userId),
    repo.getRounds(userId),
    repo.getShots(userId),
    repo.getPracticeSessions(userId),
    repo.getDrillAttempts(userId),
    repo.getSwingSessions(userId),
    repo.getSwingFindings(userId),
    repo.getHandicapHistory(userId),
    repo.getActivePlan(userId),
  ]);

  const drills = repo.getDrills();
  const shots = scoreShots(rawShots);

  const shotsByRound = new Map<string, ScoredShot[]>();
  for (const shot of shots) {
    const list = shotsByRound.get(shot.round_id) ?? [];
    list.push(shot);
    shotsByRound.set(shot.round_id, list);
  }

  const segments = buildSegments(shots);
  const trends = practiceTrends(drillAttempts, drills);
  const weaknesses = profile
    ? identifyWeaknesses({
        segments,
        profile,
        practiceTrends: trends,
        swingFindings,
        totalRounds: rounds.length,
      })
    : [];

  const planProgress = plan ? evaluatePlanProgress(plan.plan, plan.sessions, trends) : null;
  const scoring = scoringTrend(rounds);

  const context =
    profile !== null
      ? buildCoachingContext({
          profile,
          rounds,
          shots,
          weaknesses,
          practiceSessions,
          practiceTrends: trends,
          drillAttemptCount: drillAttempts.length,
          swingSessions,
          swingFindings,
          drills,
          plan: plan && planProgress ? { ...plan, progress: planProgress } : null,
          scoringTrend: scoring,
        })
      : null;

  return {
    userId,
    profile,
    drills,
    rounds,
    shots,
    shotsByRound,
    summary: summarizeStrokesGained(shots),
    segments,
    weaknesses,
    practiceSessions,
    drillAttempts,
    practiceTrends: trends,
    improvement: improvementSummary(trends),
    volume: practiceVolume(practiceSessions),
    swingSessions,
    swingFindings,
    handicapHistory,
    plan,
    planProgress,
    sgTrend: sgTrend(rounds, shotsByRound),
    scoringTrend: scoring,
    context,
    hasData: shots.length > 0 || drillAttempts.length > 0,
  };
}

/** Today's plan session, if the active plan has one scheduled for today. */
export function todaysSession(state: PlayerState, today = new Date()) {
  if (!state.plan) return null;
  const start = new Date(`${state.plan.plan.starts_on}T00:00:00.000Z`);
  const dayOffset = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  if (dayOffset < 0) return null;
  const week = Math.floor(dayOffset / 7) + 1;
  const day = (dayOffset % 7) + 1;
  return (
    state.plan.sessions.find((s) => s.week === week && s.day === day) ??
    state.plan.sessions.find((s) => s.status === "scheduled" && !s.is_rest) ??
    null
  );
}

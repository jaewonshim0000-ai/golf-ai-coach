import type { PracticeMetricTrend, Segment, SGSummary, TrendPoint, Weakness } from "./../types/analytics";
import type { HandicapEntry, PlayerProfile } from "./../types/player";
import type { Round, ScoredShot } from "./../types/rounds";
import type {
  Drill,
  DrillAttempt,
  PracticeSession,
  Skill,
  SwingFinding,
  SwingMeasurement,
  SwingSession,
} from "./../types/practice";
import { buildSegments, scoringTrend, sgTrend, summarizeStrokesGained } from "./analytics/aggregate";
import { improvementSummary, practiceTrends, practiceVolume, type ImprovementSummary, type PracticeVolume } from "./analytics/practice-progress";
import { identifyWeaknesses } from "./analytics/weaknesses";
import { scoreShots } from "./golf/strokes-gained";
import { suggestSession, type SuggestedSession } from "./practice/session";
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
  swingMeasurements: SwingMeasurement[];
  handicapHistory: HandicapEntry[];
  /** Rebuilt on every request from the current ranking, never stored. */
  session: SuggestedSession | null;
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
    swingMeasurements,
  ] = await Promise.all([
    repo.getProfile(userId),
    repo.getRounds(userId),
    repo.getShots(userId),
    repo.getPracticeSessions(userId),
    repo.getDrillAttempts(userId),
    repo.getSwingSessions(userId),
    repo.getSwingFindings(userId),
    repo.getHandicapHistory(userId),
    repo.getSwingMeasurements(userId),
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

  const scoring = scoringTrend(rounds);

  // A skill counts as met only if every tracked drill for it is meeting its
  // standard, so one strong drill cannot promote the block on its own.
  const met = new Set<Skill>();
  for (const trend of trends) {
    if (trends.filter((t) => t.skill === trend.skill).every((t) => t.meeting_target)) {
      met.add(trend.skill);
    }
  }
  const session = suggestSession(profile, weaknesses, (skill) => met.has(skill));

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
    swingMeasurements,
    handicapHistory,
    session,
    sgTrend: sgTrend(rounds, shotsByRound),
    scoringTrend: scoring,
    context,
    hasData: shots.length > 0 || drillAttempts.length > 0,
  };
}
